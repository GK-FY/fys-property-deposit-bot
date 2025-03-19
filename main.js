/*************************************************
 * main.js
 *************************************************/
const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const qrcodeTerminal = require('qrcode-terminal');
const QRCode = require('qrcode');
const axios = require('axios');

// 1) Global variable to hold the current QR code text (for the Express page).
let currentQR = "";

// 2) Admin number
const adminNumber = '254701339573@c.us';

// 3) Customizable welcome message (edited by admin command).
let welcomeMessage = "*👋 Welcome to FY'S PROPERTY Deposit Bot!*\nHow much would you like to deposit? 💰";

// 4) Create the WhatsApp client instance with local authentication.
const client = new Client({
    authStrategy: new LocalAuth()
});

// When a QR code is generated, store it and also print to terminal
client.on('qr', qr => {
    currentQR = qr;
    qrcodeTerminal.generate(qr, { small: true });
});

// When the client is ready
client.on('ready', () => {
    console.log('WhatsApp client is *ready*!');
});

// 5) In-memory conversation state per chat
const conversations = {};

// Helper function: send STK push to Pay Hero
async function sendSTKPush(amount, phone) {
    const payload = {
        amount: amount,
        phone_number: phone,
        channel_id: 529,
        provider: "m-pesa",
        external_reference: "INV-009",
        customer_name: "John Doe",
        callback_url: "https://your-callback-url", // Replace with your callback URL
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

// Helper function: fetch transaction status from Pay Hero
async function fetchTransactionStatus(ref) {
    try {
        const response = await axios.get(
            `https://backend.payhero.co.ke/api/v2/transaction-status?reference=${encodeURIComponent(ref)}`,
            {
                headers: {
                    'Authorization': 'Basic QklYOXY0WlR4RUV4ZUJSOG1EdDY6c2lYb09taHRYSlFMbWZ0dFdqeGp4SG13NDFTekJLckl2Z2NWd2F1aw=='
                }
            }
        );
        return response.data;
    } catch (error) {
        console.error("Status Fetch Error:", error);
        return null;
    }
}

// Helper function: send alert to admin
function sendAdminAlert(text) {
    client.sendMessage(adminNumber, text);
}

// Helper function: parse broadcast command from admin
function parseBroadcastCommand(msg) {
    // Example command: msg [254712345678,254700123456] Hello guys, test message
    // 1) Check for "msg ["
    const bracketStart = msg.indexOf('[');
    const bracketEnd = msg.indexOf(']');
    if (bracketStart < 0 || bracketEnd < 0) return null;

    // Extract the bracket content
    const numbersStr = msg.substring(bracketStart + 1, bracketEnd).trim();
    // The message text is after the bracket
    const theMessage = msg.substring(bracketEnd + 1).trim();
    // Split the numbers by comma
    const numbersArr = numbersStr.split(',').map(n => n.trim());
    return { numbers: numbersArr, text: theMessage };
}

// 6) Listen for incoming WhatsApp messages
client.on('message', async message => {
    const sender = message.from;
    const text = message.body.trim();
    const lowerText = text.toLowerCase();

    /********************************************
     * Check if the message is from the admin
     ********************************************/
    if (sender === adminNumber) {
        // 6a) Admin can edit welcome message
        // e.g. "editwelcome This is the new welcome text"
        if (lowerText.startsWith('editwelcome ')) {
            const newWelcome = message.body.substring('editwelcome '.length).trim();
            welcomeMessage = newWelcome || welcomeMessage;
            message.reply("*Welcome message updated successfully!*");
            return;
        }

        // 6b) Admin can send a broadcast message
        // e.g. "msg [254712345678,254701234567] Hello guys, test message"
        if (lowerText.startsWith('msg [')) {
            const result = parseBroadcastCommand(message.body);
            if (!result) {
                message.reply("*⚠️ Invalid format.* Use: msg [2547...,2547...] Your message");
                return;
            }
            const { numbers, text: adminMsg } = result;
            if (!numbers || !adminMsg) {
                message.reply("*⚠️ Invalid format.*");
                return;
            }
            // Send message to each user
            for (let num of numbers) {
                const finalNumber = num.endsWith('@c.us') ? num : (num + '@c.us');
                // Add a small "From Admin GK-FY" style
                client.sendMessage(
                    finalNumber,
                    `*From Admin GK-FY:*\n${adminMsg}`
                );
            }
            message.reply("*Message sent successfully to the specified users!*");
            return;
        }
        // If admin typed something else, fall through to deposit flow
    }

    /********************************************
     * Deposit Flow
     ********************************************/
    // If user types "start", reset conversation
    if (lowerText === 'start') {
        conversations[sender] = { stage: 'awaitingAmount' };
        message.reply(welcomeMessage);
        return;
    }

    // If no conversation, initialize it
    if (!conversations[sender]) {
        conversations[sender] = { stage: 'awaitingAmount' };
        message.reply(welcomeMessage);
        return;
    }

    const conv = conversations[sender];

    // Stage 1: Await deposit amount
    if (conv.stage === 'awaitingAmount') {
        const amount = parseInt(text);
        if (isNaN(amount) || amount <= 0) {
            message.reply("*⚠️ Please enter a valid deposit amount in Ksh.*");
            return;
        }
        conv.amount = amount;
        conv.stage = 'awaitingDepositNumber';
        message.reply(`*👍 Great!* You've chosen to deposit *Ksh ${amount}*.\nNow, please provide your deposit number (e.g., your account number) 📱`);
        return;
    }

    // Stage 2: Await deposit number
    if (conv.stage === 'awaitingDepositNumber') {
        conv.depositNumber = text;
        conv.stage = 'processing';

        // Immediately initiate STK push
        const stkRef = await sendSTKPush(conv.amount, conv.depositNumber);
        if (!stkRef) {
            message.reply("*❌ Error:* Unable to initiate payment. Please try again later.");
            delete conversations[sender];
            return;
        }
        conv.stkRef = stkRef;

        // Alert admin about deposit attempt
        const attemptTime = new Date().toLocaleString("en-GB", { timeZone: "Africa/Nairobi" });
        sendAdminAlert(
            `*💸 Deposit Attempt:*\n` +
            `Amount: Ksh ${conv.amount}\n` +
            `Deposit Number: ${conv.depositNumber}\n` +
            `Time (KE): ${attemptTime}`
        );

        // Inform user, minimal countdown approach
        message.reply("*⏳ Payment initiated!* We'll check status in 20 seconds...\n_Stay tuned!_");

        // After 10 seconds, send an update
        setTimeout(() => {
            client.sendMessage(sender, "*⏳ 10 seconds left...*\nWe will fetch the status soon!");
        }, 10000);

        // After 20 seconds, poll transaction status
        setTimeout(async () => {
            const statusData = await fetchTransactionStatus(conv.stkRef);
            if (!statusData) {
                message.reply("*❌ Error fetching payment status.* Please try again later.");
                delete conversations[sender];
                return;
            }
            const finalStatus = statusData.status ? statusData.status.toUpperCase() : "UNKNOWN";
            const providerReference = statusData.provider_reference || "";
            const resultDesc = statusData.ResultDesc || "";
            const currentDateTime = new Date().toLocaleString("en-GB", { timeZone: "Africa/Nairobi" });

            if (finalStatus === "SUCCESS") {
                message.reply(
                    `*🎉 Payment Successful!*\n` +
                    `*💰 Amount:* Ksh ${conv.amount}\n` +
                    `*📞 Deposit Number:* ${conv.depositNumber}\n` +
                    `*🆔 MPESA Transaction Code:* ${providerReference}\n` +
                    `*⏰ Date/Time (KE):* ${currentDateTime}\n\n` +
                    `Thank you for using FY'S PROPERTY!\nType *Start* to deposit again.`
                );
                // Alert admin about success
                sendAdminAlert(
                    `*✅ Deposit Successful:*\n` +
                    `Amount: Ksh ${conv.amount}\n` +
                    `Deposit Number: ${conv.depositNumber}\n` +
                    `MPESA Code: ${providerReference}\n` +
                    `Time (KE): ${currentDateTime}`
                );
            } else if (finalStatus === "FAILED") {
                let errMsg = "Your payment could not be completed. Please try again.";
                if (resultDesc.toLowerCase().includes('insufficient')) {
                    errMsg = "Insufficient funds in your account.";
                } else if (resultDesc.toLowerCase().includes('wrong pin') || resultDesc.toLowerCase().includes('incorrect pin')) {
                    errMsg = "The PIN you entered is incorrect.";
                }
                message.reply(`*❌ Payment Failed!* ${errMsg}\nType *Start* to try again.`);
                sendAdminAlert(
                    `*❌ Deposit Failed:*\n` +
                    `Amount: Ksh ${conv.amount}\n` +
                    `Deposit Number: ${conv.depositNumber}\n` +
                    `Error: ${errMsg}\n` +
                    `Time (KE): ${currentDateTime}`
                );
            } else {
                message.reply(
                    `*⏳ Payment Pending.* Current status: ${finalStatus}\n` +
                    `Please wait a bit longer or contact support.\n(Type *Start* to restart.)`
                );
            }
            delete conversations[sender];
        }, 20000);

        return;
    }
});

// 7) Initialize the WhatsApp client
client.initialize();

// --------------------------------------------------------
// EXPRESS SERVER TO DISPLAY QR CODE ON A WEB PAGE
// --------------------------------------------------------
const app = express();
const port = process.env.PORT || 3000;

app.get('/', async (req, res) => {
    let qrImage = '';
    if (currentQR) {
        try {
            // Convert the QR code text to a data URL so we can display it as an <img>
            qrImage = await QRCode.toDataURL(currentQR);
        } catch (err) {
            console.error("QR code generation error:", err);
        }
    }
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>FY'S PROPERTY - WhatsApp Bot QR</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body {
            font-family: Arial, sans-serif;
            text-align: center;
            background: #222;
            color: #fff;
            padding: 20px;
          }
          h1 {
            color: #12c99b;
            margin-bottom: 20px;
          }
          .qr-container {
            background: #333;
            display: inline-block;
            padding: 20px;
            border-radius: 10px;
          }
          img {
            max-width: 250px;
            margin: 10px;
          }
        </style>
      </head>
      <body>
        <h1>Scan This QR Code to Authenticate Your Bot</h1>
        <div class="qr-container">
          ${
            qrImage
              ? `<img src="${qrImage}" alt="WhatsApp QR Code" />`
              : '<p>No QR code available yet. Please wait...</p>'
          }
        </div>
      </body>
      </html>
    `);
});

app.listen(port, () => {
    console.log(`Express server running on port ${port}`);
});
