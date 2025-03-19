Below is a **sample** `README.md` you can place in your GitHub repository. It highlights the bot’s features, installation steps, usage instructions, and admin commands, all in a **beautiful, user-friendly** format. You can customize or expand on it as you see fit.

---

```markdown
# FY'S PROPERTY DEPOSIT BOT

**Developer**: FY'S PROPERTY 🕊️

A **WhatsApp Deposit Bot** that integrates with [Pay Hero](https://backend.payhero.co.ke/) for MPESA STK pushes.  
It offers a **two-step countdown** to avoid spam, admin commands to edit bot messages & broadcast to multiple users,  
and a convenient **Express server** to display the QR code for authentication.

---

## Key Features

1. **Private-Chat Only**  
   - The bot **ignores** group chats (`@g.us`) and only works in **1-on-1** conversations.

2. **Deposit Flow**  
   - Asks for **deposit amount** and **deposit number**, then sends an **STK push** to Pay Hero.  
   - Provides **two** minimal countdown updates at **10s** and **20s**, then fetches transaction status.  
   - Sends **admin alerts** for deposit attempts and successes.

3. **Editable Messages & Channel ID**  
   - The admin (phone number `254701339573`) can **edit** any of the bot’s text strings, including placeholders (`{amount}`, `{depositNumber}`, `{seconds}`, `{mpesaCode}`, `{date}`, `{footer}`) and the **channelID** used for STK push.  
   - This allows for **dynamic** customization without modifying the source code.

4. **Mass/Broadcast Messaging**  
   - The admin can **send** a message to **multiple phone numbers** simultaneously with a single command.  
   - The bot automatically **formats** phone numbers (e.g. `07...` → `2547...`) and **skips** invalid ones.

5. **QR Code Web Server**  
   - Launches an **Express server** on `http://localhost:3000`, displaying the **WhatsApp QR code** for easy scanning.  
   - Once scanned, your bot is authenticated and ready to receive messages.

6. **No Spam**  
   - The deposit flow only updates the user **twice** (at 10s and 20s), minimizing risk of spam or rate-limiting.

---

## Installation & Setup

1. **Clone** or **Download** this repository.
2. Make sure you have **Node.js (v14+)** installed.  
   - Check with:  
     ```bash
     node -v
     ```
3. Navigate to the repository folder and install dependencies:
   ```bash
   npm install
   ```
4. Start the bot:
   ```bash
   npm start
   ```
5. Open your browser to [http://localhost:3000](http://localhost:3000) to see the **QR code**.  
   - Scan this code with **WhatsApp** on your phone (under “Linked devices”).

When you see “**WhatsApp client is *ready*!**” in your terminal, your bot is live and waiting for messages.

---

## Usage

### 1) Normal Users
- Send **Start** to the bot in a **private chat** (not a group).  
- The bot asks for a **deposit amount**, then a **deposit number**.  
- It immediately sends an STK push to Pay Hero.  
- After **10 seconds**, you get a small countdown update.  
- After **20 seconds**, the bot fetches the transaction status and replies with **success**, **failure**, or **pending**.

### 2) Admin User
- The admin is **254701339573** by default.  
- Type **admin** to see the list of admin commands:
  ```
  *ADMIN COMMANDS:*
  1) admin - Show this help.
  2) edit <key> <newText> - Edit a config value.
  3) msg [numbers...] message - Broadcast to multiple users.
  ```
  
#### Admin Examples

1. **Edit Bot Strings**  
   - `edit welcomeMessage Hello from GK-FY!\nHow much would you like to deposit?`  
   - `edit depositChosen Great, you decided to deposit {amount} Ksh!\nPlease share your deposit number.`  
   - `edit paymentInitiated Payment initiated!\nWe'll check status in {seconds} seconds...`  
   - `edit countdownUpdate {seconds} seconds left...\nWe will fetch the status soon!`  
   - `edit paymentSuccess Payment Successful!\nAmount: {amount}\nDeposit Number: {depositNumber}\nM-PESA Code: {mpesaCode}\nDate: {date}\n{footer}`  
   - `edit paymentFooter Thank you for choosing FY'S PROPERTY!\nType Start to deposit again.`  
   - `edit fromAdmin From Admin GK-FY`  
   - `edit channelID 911`

2. **Broadcast Messages**  
   - `msg [254712345678,254701234567] Hello from GK-FY!`
   - The bot attempts to format phone numbers (07... → 2547...) and sends the message.  
   - Invalid numbers are skipped with a warning.  
   - The broadcast includes the custom label `fromAdmin` at the top.

### 3) Placeholders
You can use the following placeholders in your edited messages:
- `{amount}` → deposit amount  
- `{depositNumber}` → deposit number  
- `{seconds}` → countdown seconds (10 or 20)  
- `{mpesaCode}` → M-PESA transaction code  
- `{date}` → date/time in Kenyan time  
- `{footer}` → the text in `paymentFooter`

---

## Bot Flow Diagram

```
User: "start"
Bot: [welcomeMessage]
User: "1000" (deposit amount)
Bot: [depositChosen w/ {amount}]
User: "0712345678" (deposit number)
Bot: [paymentInitiated w/ {seconds}=20]
...10 seconds pass...
Bot: [countdownUpdate w/ {seconds}=10]
...10 more seconds pass...
Bot fetches status => success/failure/pending
Bot: [paymentSuccess or failure message]
```

---

## License & Developer

This project is open source under the **ISC License**.  
**Developer**: FY'S PROPERTY 🕊️

Feel free to modify or extend this code to suit your specific needs.  
Enjoy your fully customizable **WhatsApp Deposit Bot**!  
