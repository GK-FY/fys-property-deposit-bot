const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const axios = require('axios');

// In-memory conversation state per chat ID.
const conversations = {};

// Create a new client instance using local authentication.
const client = new Client({
    authStrategy: new LocalAuth()
});

// Display QR code in the terminal for authentication.
client.on('qr', qr => {
    qrcode.generate(qr, { small: true });
});

// When the client is ready.
client.on('ready', () => {
    console.log('Client is ready!');
});

// Helper function to send STK push to Pay Hero.
async function sendSTKPush(amount, phone) {
    const payload = {
        amount: amount,
        phone_number: phone,
        channel_id: 529,
        provider: "m-pesa",
        external_reference: "INV-009",
        customer_name: "John Doe",
        callback_url: "https://your-callback-url", // Replace with your actual callback URL if needed.
        account_reference: "FY'S PROPERTY",
        transaction_desc: "FY'S PROPERTY Payment",
        remarks: "FY'S PROPERTY",
        business_name: "FY'S PROPERTY",
        companyName: "FY'S PROPERTY"
    };
    try {
        const response = await axios.post('https://backend.payhero.co.ke/api/v2/payments', payload, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic QklYOXY0WlR4RUV4ZUJSOG1EdDY6c2lYb09taHRYSlFMbWZ0dFdqeGp4SG13NDFTekJLckl2Z2NWd2F1aw=='
            }
        });
        return response.data.reference;
    } catch (error) {
        console.error("STK Push Error:", error);
        return null;
    }
}

// Helper function to fetch transaction status.
async function fetchTransactionStatus(ref) {
    try {
        const response = await axios.get(`https://backend.payhero.co.ke/api/v2/transaction-status?reference=${encodeURIComponent(ref)}`, {
            headers: {
                'Authorization': 'Basic QklYOXY0WlR4RUV4ZUJSOG1EdDY6c2lYb09taHRYSlFMbWZ0dFdqeGp4SG13NDFTekJLckl2Z2NWd2F1aw=='
            }
        });
        return response.data;
    } catch (error) {
        console.error("Status Fetch Error:", error);
        return null;
    }
}

// Conversation flow for deposit commands.
client.on('message', async message => {
    const sender = message.from;
    const text = message.body.trim();
    const lowerText = text.toLowerCase();

    // If user types "start", reset the conversation.
    if (lowerText === 'start') {
        conversations[sender] = { stage: 'awaitingAmount' };
        message.reply("👋 Welcome to FY'S PROPERTY Deposit Bot!\nHow much would you like to deposit? 💰");
        return;
    }

    // Initialize conversation state if not already set.
    if (!conversations[sender]) {
        conversations[sender] = { stage: 'awaitingAmount' };
        message.reply("👋 Welcome to FY'S PROPERTY Deposit Bot!\nHow much would you like to deposit? 💰\n(Type 'Start' anytime to restart.)");
        return;
    }

    const conv = conversations[sender];

    // Stage 1: Await deposit amount.
    if (conv.stage === 'awaitingAmount') {
        const amount = parseInt(text);
        if (isNaN(amount) || amount <= 0) {
            message.reply("⚠️ Please enter a valid deposit amount in Ksh.");
            return;
        }
        conv.amount = amount;
        conv.stage = 'awaitingDepositNumber';
        message.reply(`👍 Great! You've chosen to deposit Ksh ${amount}.\nNow, please provide your deposit number (e.g. your account number) 📱`);
        return;
    }

    // Stage 2: Await deposit number.
    if (conv.stage === 'awaitingDepositNumber') {
        conv.depositNumber = text;
        conv.stage = 'processing';
        // Immediately initiate the STK push.
        const ref = await sendSTKPush(conv.amount, conv.depositNumber);
        if (!ref) {
            message.reply("❌ Error: Unable to initiate payment. Please try again later.");
            delete conversations[sender];
            return;
        }
        conv.stkRef = ref;
        // Immediately inform the user and start a countdown.
        message.reply("⏳ Payment initiated! Please wait 20 seconds for confirmation. (20 seconds remaining...)");
        // After 10 seconds, send a countdown update.
        setTimeout(() => {
            client.sendMessage(sender, "⏳ 10 seconds remaining...");
        }, 10000);
        // After 20 seconds, poll transaction status.
        setTimeout(async () => {
            const statusData = await fetchTransactionStatus(conv.stkRef);
            if (!statusData) {
                message.reply("❌ Error fetching payment status. Please try again later.");
                delete conversations[sender];
                return;
            }
            const finalStatus = statusData.status ? statusData.status.toUpperCase() : "UNKNOWN";
            const providerReference = statusData.provider_reference || "";
            const resultDesc = statusData.ResultDesc || "";
            const currentDateTime = new Date().toLocaleString("en-GB", { timeZone: "Africa/Nairobi" });

            if (finalStatus === "SUCCESS") {
                message.reply(`🎉 Payment Successful!\n💰 Amount: Ksh ${conv.amount}\n📞 Deposit Number: ${conv.depositNumber}\n🆔 MPESA Transaction Code: ${providerReference}\n⏰ Date/Time (KE): ${currentDateTime}\n\nThank you for using FY'S PROPERTY! Type "Start" to deposit again.`);
            } else if (finalStatus === "FAILED") {
                let errMsg = "Your payment could not be completed. Please try again.";
                if (resultDesc.toLowerCase().includes('insufficient')) {
                    errMsg = "Insufficient funds in your account.";
                } else if (resultDesc.toLowerCase().includes('wrong pin') || resultDesc.toLowerCase().includes('incorrect pin')) {
                    errMsg = "The PIN you entered is incorrect.";
                }
                message.reply(`❌ Payment Failed! ${errMsg}\nType "Start" to try again.`);
            } else {
                message.reply(`⏳ Payment Pending. Current status: ${finalStatus}. Please wait a bit longer or contact support.\n(Type "Start" to restart if needed.)`);
            }
            delete conversations[sender];
        }, 20000); // 20 seconds delay.
        return;
    }
});

// Initialize and start the client.
client.initialize();
