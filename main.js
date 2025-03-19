const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const qrcodeTerminal = require('qrcode-terminal');
const QRCode = require('qrcode');
const axios = require('axios');

// Global variable to hold the current QR code text.
let currentQR = "";

// Create the WhatsApp client instance with local authentication.
const client = new Client({
    authStrategy: new LocalAuth()
});

// When a QR code is generated, save it and also print it to the terminal.
client.on('qr', qr => {
    currentQR = qr;
    qrcodeTerminal.generate(qr, { small: true });
});

// When the client is ready.
client.on('ready', () => {
    console.log('WhatsApp client is ready!');
});

// In-memory conversation state per chat.
const conversations = {};

// Helper function: send STK push.
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

// Helper function: fetch transaction status.
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

// Helper function: send alert to admin.
function sendAdminAlert(text) {
    // WhatsApp admin number in proper format.
    const adminNumber = '254701339573@c.us';
    client.sendMessage(adminNumber, text);
}

// Conversation flow.
client.on('message', async message => {
    const sender = message.from;
    const text = message.body.trim();
    const lowerText = text.toLowerCase();

    // Restart conversation if user sends "start".
    if (lowerText === 'start') {
        conversations[sender] = { stage: 'awaitingAmount' };
        message.reply("👋 Welcome to FY'S PROPERTY Deposit Bot!\nHow much would you like to deposit? 💰");
        return;
    }

    // Initialize conversation if not present.
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

        // Immediately initiate STK push.
        const ref = await sendSTKPush(conv.amount, conv.depositNumber);
        if (!ref) {
            message.reply("❌ Error: Unable to initiate payment. Please try again later.");
            delete conversations[sender];
            return;
        }
        conv.stkRef = ref;
        
        // Send admin alert for deposit attempt.
        const attemptTime = new Date().toLocaleString("en-GB", { timeZone: "Africa/Nairobi" });
        sendAdminAlert(`💸 Deposit Attempt:\nAmount: Ksh ${conv.amount}\nDeposit Number: ${conv.depositNumber}\nTime (KE): ${attemptTime}`);
        
        // Inform user and start countdown.
        message.reply("⏳ Payment initiated! Countdown starts now: 20 seconds remaining...");

        let secondsLeft = 20;
        const countdownInterval = setInterval(() => {
            secondsLeft--;
            client.sendMessage(sender, `⏳ ${secondsLeft} second${secondsLeft === 1 ? '' : 's'} remaining...`);
            if (secondsLeft <= 0) {
                clearInterval(countdownInterval);
                // After countdown, poll transaction status.
                (async () => {
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
                        sendAdminAlert(`✅ Deposit Successful:\nAmount: Ksh ${conv.amount}\nDeposit Number: ${conv.depositNumber}\nMPESA Code: ${providerReference}\nTime (KE): ${currentDateTime}`);
                    } else if (finalStatus === "FAILED") {
                        let errMsg = "Your payment could not be completed. Please try again.";
                        if (resultDesc.toLowerCase().includes('insufficient')) {
                            errMsg = "Insufficient funds in your account.";
                        } else if (resultDesc.toLowerCase().includes('wrong pin') || resultDesc.toLowerCase().includes('incorrect pin')) {
                            errMsg = "The PIN you entered is incorrect.";
                        }
                        message.reply(`❌ Payment Failed! ${errMsg}\nType "Start" to try again.`);
                        sendAdminAlert(`❌ Deposit Failed:\nAmount: Ksh ${conv.amount}\nDeposit Number: ${conv.depositNumber}\nError: ${errMsg}\nTime (KE): ${currentDateTime}`);
                    } else {
                        message.reply(`⏳ Payment Pending. Current status: ${finalStatus}. Please wait a bit longer or contact support.\n(Type "Start" to restart.)`);
                    }
                    delete conversations[sender];
                })();
            }
        }, 1000);
        return;
    }
});

// Start the WhatsApp client.
client.initialize();

// ------------------------------------------------------------------
// Express server to display QR code on a webpage
// ------------------------------------------------------------------
const app = express();
const port = process.env.PORT || 3000;

app.get('/', async (req, res) => {
    let qrImage = '';
    if (currentQR) {
        try {
            qrImage = await QRCode.toDataURL(currentQR);
        } catch (err) {
            console.error(err);
        }
    }
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>FY'S PROPERTY - WhatsApp Bot QR</title>
        <link rel="icon" href="https://iili.io/3oPqsb1.webp">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: Arial, sans-serif; text-align: center; background: url('https://iili.io/3oPqsb1.webp') no-repeat center center fixed; background-size: cover; color: #fff; padding: 20px; }
          img { max-width: 300px; }
          h1 { color: #12c99b; }
        </style>
      </head>
      <body>
        <h1>Scan This QR Code to Authenticate Your Bot</h1>
        ${qrImage ? `<img src="${qrImage}" alt="QR Code" />` : '<p>No QR code available at the moment.</p>'}
      </body>
      </html>
    `);
});

app.listen(port, () => {
    console.log(`Express server running on port ${port}`);
});
