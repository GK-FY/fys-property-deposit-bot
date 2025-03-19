const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

// In-memory conversation state (per chat ID)
const conversations = {};

// Create the WhatsApp client instance using local authentication.
const client = new Client({
    authStrategy: new LocalAuth()
});

// Display the QR code in the terminal for authentication.
client.on('qr', qr => {
    qrcode.generate(qr, { small: true });
});

// When the client is ready.
client.on('ready', () => {
    console.log('Client is ready!');
});

// Listen for incoming messages.
client.on('message', message => {
    const sender = message.from;
    const text = message.body.trim();
    const lowerText = text.toLowerCase();

    // Allow the user to restart at any time by sending "start".
    if (lowerText === 'start') {
        conversations[sender] = { stage: 'awaitingAmount' };
        message.reply("👋 Welcome to FY'S PROPERTY Deposit Bot!\nHow much would you like to deposit? 💰");
        return;
    }

    // If no conversation state exists for this sender, start one.
    if (!conversations[sender]) {
        conversations[sender] = { stage: 'awaitingAmount' };
        message.reply("👋 Welcome to FY'S PROPERTY Deposit Bot!\nHow much would you like to deposit? 💰\n(You can type 'Start' at any time to restart.)");
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
        message.reply(`👍 Great! You've chosen to deposit Ksh ${amount}.\nNow, please enter your deposit number 📱 (e.g. your account number).`);
        return;
    }

    // Stage 2: Await deposit number.
    if (conv.stage === 'awaitingDepositNumber') {
        conv.depositNumber = text;
        conv.stage = 'processing';
        message.reply("⏳ Thank you! Your deposit is being processed... Please wait 20 seconds.");
        
        // Simulate STK push call and processing delay.
        setTimeout(() => {
            // Simulate an outcome with random results:
            // ~70% chance for SUCCESS, ~15% for insufficient funds, ~15% for wrong PIN.
            const rand = Math.random();
            let finalStatus;
            let mpesaCode = "";
            if (rand < 0.70) {
                finalStatus = "SUCCESS";
                // Simulated MPESA transaction code:
                mpesaCode = "MPESA" + Math.floor(Math.random() * 1000000);
            } else if (rand < 0.85) {
                finalStatus = "FAILED"; // insufficient funds
            } else {
                finalStatus = "FAILED"; // wrong PIN
            }
            
            const currentDateTime = new Date().toLocaleString("en-GB", { timeZone: "Africa/Nairobi" });
            
            if (finalStatus === "SUCCESS") {
                // Construct final success message with details.
                message.reply(`🎉 Payment Successful!\n\n💰 Amount: Ksh ${conv.amount}\n📞 Deposit Number: ${conv.depositNumber}\n🆔 MPESA Transaction Code: ${mpesaCode}\n⏰ Date/Time (KE): ${currentDateTime}\n\nThank you for using FY'S PROPERTY! Type "Start" to deposit again.`);
            } else if (finalStatus === "FAILED" && rand < 0.85) {
                message.reply("❌ Payment Failed! Insufficient funds in your account. Please check your balance and try again.\nType 'Start' to try again.");
            } else {
                message.reply("❌ Payment Failed! The PIN you entered is incorrect. Please try again.\nType 'Start' to restart the deposit process.");
            }
            
            // Clear the conversation state.
            delete conversations[sender];
        }, 20000); // 20 seconds delay.
        return;
    }
});

// Initialize the client.
client.initialize();
