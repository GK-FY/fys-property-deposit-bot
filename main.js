/*******************************************************************
 * main.js
 *******************************************************************/
const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const qrcodeTerminal = require('qrcode-terminal');
const QRCode = require('qrcode');
const axios = require('axios');

/***********************************************************
 * GLOBAL / CONFIG
 ***********************************************************/
// 1) Store the current QR code text for Express to display
let currentQR = "";

// 2) Admin phone number
const ADMIN_NUMBER = '254701339573@c.us';

// 3) Bot config: editable strings and channel ID
//    Admin can change these via commands like: edit <key> <newValue>
let botConfig = {
  welcomeMessage: "*👋 Welcome to FY'S PROPERTY Deposit Bot!*\nHow much would you like to deposit? 💰",
  depositChosen: "*👍 Great!* You've chosen to deposit *Ksh {amount}*.\nNow, please provide your deposit number (e.g., your account number) 📱",
  paymentInitiated: "*⏳ Payment initiated!* We'll check status in {seconds} seconds...\n_Stay tuned!_",
  countdownUpdate: "*⏳ {seconds} seconds left...*\nWe will fetch the status soon!",
  paymentSuccess: "*🎉 Payment Successful!*\n*💰 Amount:* Ksh {amount}\n*📞 Deposit Number:* {depositNumber}\n*🆔 MPESA Transaction Code:* {mpesaCode}\n*⏰ Date/Time (KE):* {date}\n{footer}",
  paymentFooter: "Thank you for choosing FY'S PROPERTY! Type *Start* to deposit again.",
  fromAdmin: "From Admin GK-FY",
  channelID: 529
};

// 4) In-memory conversation state per user
const conversations = {};

/***********************************************************
 * WHATSAPP CLIENT
 ***********************************************************/
const client = new Client({
  authStrategy: new LocalAuth()
});

// Save QR code text and show in terminal
client.on('qr', qr => {
  currentQR = qr;
  qrcodeTerminal.generate(qr, { small: true });
});

// When client is ready
client.on('ready', () => {
  console.log('WhatsApp client is *ready*!');
});

/***********************************************************
 * HELPER FUNCTIONS
 ***********************************************************/
// Replaces placeholders in a string, e.g. {amount}, {seconds}, {depositNumber}, {mpesaCode}, {date}, {footer}
function parsePlaceholders(template, data) {
  return template
    .replace(/{amount}/g, data.amount || '')
    .replace(/{depositNumber}/g, data.depositNumber || '')
    .replace(/{seconds}/g, data.seconds || '')
    .replace(/{mpesaCode}/g, data.mpesaCode || '')
    .replace(/{date}/g, data.date || '')
    .replace(/{footer}/g, botConfig.paymentFooter || '');
}

// Send STK push to Pay Hero
async function sendSTKPush(amount, phone) {
  const payload = {
    amount: amount,
    phone_number: phone,
    channel_id: botConfig.channelID, // <-- use the editable channelID
    provider: "m-pesa",
    external_reference: "INV-009",
    customer_name: "John Doe",
    callback_url: "https://your-callback-url", // replace if needed
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

// Fetch transaction status from Pay Hero
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

// Send alert message to admin
function sendAdminAlert(text) {
  client.sendMessage(ADMIN_NUMBER, text);
}

// Parse broadcast command: "msg [254712345678,254701234567] Hello!"
function parseBroadcastCommand(msg) {
  const bracketStart = msg.indexOf('[');
  const bracketEnd = msg.indexOf(']');
  if (bracketStart < 0 || bracketEnd < 0) return null;
  const numbersStr = msg.substring(bracketStart + 1, bracketEnd).trim();
  const theMessage = msg.substring(bracketEnd + 1).trim();
  const numbersArr = numbersStr.split(',').map(n => n.trim());
  return { numbers: numbersArr, text: theMessage };
}

/***********************************************************
 * ADMIN COMMANDS - show usage if "admin"
 ***********************************************************/
function getAdminHelp() {
  return (
    "*ADMIN COMMANDS:*\n" +
    "1) *admin* - Show this help.\n" +
    "2) *edit <key> <newText>* - Edit any of these keys:\n" +
    "   - welcomeMessage\n" +
    "   - depositChosen\n" +
    "   - paymentInitiated\n" +
    "   - countdownUpdate\n" +
    "   - paymentSuccess\n" +
    "   - paymentFooter\n" +
    "   - fromAdmin\n" +
    "   - channelID\n" +
    "   Example:\n     edit depositChosen Great, you've chosen {amount} to deposit!\n" +
    "3) *msg [2547...,2547...] message...* - Broadcast to multiple users.\n" +
    "   Example:\n     msg [254712345678,254701234567] Hello all!\n"
  );
}

/***********************************************************
 * MESSAGE EVENT
 ***********************************************************/
client.on('message', async message => {
  const sender = message.from;
  const text = message.body.trim();
  const lowerText = text.toLowerCase();

  // 1) If this is a group message, ignore (it doesn't work in group).
  if (sender.endsWith('@g.us')) {
    return; // do nothing for groups
  }

  // 2) If user is admin => handle admin commands
  if (sender === ADMIN_NUMBER) {
    // If user typed "admin" => show admin help
    if (lowerText === 'admin') {
      message.reply(getAdminHelp());
      return;
    }
    // If user typed "edit <key> <newValue>"
    if (lowerText.startsWith('edit ')) {
      const parts = text.split(' ');
      if (parts.length < 3) {
        message.reply("*⚠️ Invalid format.* Use: edit <key> <newValue>");
        return;
      }
      const key = parts[1];
      const newValue = text.substring(`edit ${key} `.length).trim();

      if (!botConfig.hasOwnProperty(key)) {
        message.reply("*⚠️ Unknown key.* Valid keys: welcomeMessage, depositChosen, paymentInitiated, countdownUpdate, paymentSuccess, paymentFooter, fromAdmin, channelID");
        return;
      }
      // If it's channelID, parse as number
      if (key === 'channelID') {
        const newID = parseInt(newValue);
        if (isNaN(newID)) {
          message.reply("*⚠️ channelID must be a number.*");
          return;
        }
        botConfig.channelID = newID;
        message.reply(`*channelID updated to:* ${newID}`);
        return;
      }
      // Otherwise store as string
      botConfig[key] = newValue;
      message.reply(`*${key}* updated successfully!`);
      return;
    }
    // If user typed "msg ["
    if (lowerText.startsWith('msg [')) {
      const result = parseBroadcastCommand(text);
      if (!result) {
        message.reply("*⚠️ Invalid format.* Use: msg [2547...,2547...] Your message");
        return;
      }
      const { numbers, text: adminMsg } = result;
      if (!numbers || !adminMsg) {
        message.reply("*⚠️ Invalid format.*");
        return;
      }
      // Send to each user
      for (let num of numbers) {
        const finalNumber = num.endsWith('@c.us') ? num : (num + '@c.us');
        client.sendMessage(finalNumber, `*${botConfig.fromAdmin}:*\n${adminMsg}`);
      }
      message.reply("*Message sent successfully to the specified users!*");
      return;
    }
    // If admin typed something else, we let it fall through to deposit flow
  }

  // 3) DEPOSIT FLOW
  // If user types "start", reset conversation
  if (lowerText === 'start') {
    conversations[sender] = { stage: 'awaitingAmount' };
    message.reply(botConfig.welcomeMessage);
    return;
  }

  // If no conversation, initialize it
  if (!conversations[sender]) {
    conversations[sender] = { stage: 'awaitingAmount' };
    message.reply(botConfig.welcomeMessage);
    return;
  }

  const conv = conversations[sender];

  // Stage 1: awaitingAmount
  if (conv.stage === 'awaitingAmount') {
    const amount = parseInt(text);
    if (isNaN(amount) || amount <= 0) {
      message.reply("*⚠️ Please enter a valid deposit amount in Ksh.*");
      return;
    }
    conv.amount = amount;
    conv.stage = 'awaitingDepositNumber';
    const replyText = parsePlaceholders(botConfig.depositChosen, {
      amount: String(amount)
    });
    message.reply(replyText);
    return;
  }

  // Stage 2: awaitingDepositNumber
  if (conv.stage === 'awaitingDepositNumber') {
    conv.depositNumber = text;
    conv.stage = 'processing';

    // Immediately send STK push
    const ref = await sendSTKPush(conv.amount, conv.depositNumber);
    if (!ref) {
      message.reply("*❌ Error:* Unable to initiate payment. Please try again later.");
      delete conversations[sender];
      return;
    }
    conv.stkRef = ref;

    // Admin alert about deposit attempt
    const attemptTime = new Date().toLocaleString("en-GB", { timeZone: "Africa/Nairobi" });
    sendAdminAlert(
      `*💸 Deposit Attempt:*\n` +
      `Amount: Ksh ${conv.amount}\n` +
      `Deposit Number: ${conv.depositNumber}\n` +
      `Time (KE): ${attemptTime}`
    );

    // Payment initiated message
    const initText = parsePlaceholders(botConfig.paymentInitiated, {
      seconds: '20'
    });
    message.reply(initText);

    // After 10 seconds => update
    setTimeout(() => {
      const midText = parsePlaceholders(botConfig.countdownUpdate, {
        seconds: '10'
      });
      client.sendMessage(sender, midText);
    }, 10000);

    // After 20 seconds => poll status
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
        // Payment success
        const successMsg = parsePlaceholders(botConfig.paymentSuccess, {
          amount: String(conv.amount),
          depositNumber: conv.depositNumber,
          mpesaCode: providerReference,
          date: currentDateTime
        });
        message.reply(successMsg);

        // Admin alert about success
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

/***********************************************************
 * START THE WHATSAPP CLIENT
 ***********************************************************/
client.initialize();

/***********************************************************
 * EXPRESS SERVER to display the QR code
 ***********************************************************/
const app = express();
const port = process.env.PORT || 3000;

app.get('/', async (req, res) => {
  let qrImage = '';
  if (currentQR) {
    try {
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
