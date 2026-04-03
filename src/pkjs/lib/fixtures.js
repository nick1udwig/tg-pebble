var messageGroups = require("./message_groups");

var addSenderRunMetadata = messageGroups.addSenderRunMetadata;

var FIXTURE_CHATS = Object.freeze([
  { id: 1001, title: "Alice", preview: "See you soon", unreadCount: 2 },
  { id: 2001, title: "Weekend Group", preview: "Bob: brunch at 10?", unreadCount: 11 },
  { id: 3001, title: "Reminder Bot", preview: "Hydration reminder", unreadCount: 1 },
  { id: 4001, title: "Family", preview: "Mom: train arrives at 6", unreadCount: 0 },
  { id: 5001, title: "Build Notes", preview: "Fix the sync icon on aplite", unreadCount: 4 }
]);

var FIXTURE_MESSAGES = Object.freeze({
  1001: [
    { senderId: 10, senderName: "Alice", outgoing: false, text: "Morning." },
    { senderId: 10, senderName: "Alice", outgoing: false, text: "Still on for tonight?" },
    { senderId: 1, senderName: "You", outgoing: true, text: "Yes. I can do 7." }
  ],
  2001: [
    { senderId: 21, senderName: "Alice", outgoing: false, text: "Morning all" },
    { senderId: 44, senderName: "Bob", outgoing: false, text: "Brunch at 10?" },
    { senderId: 44, senderName: "Bob", outgoing: false, text: "Cafe on 3rd?" },
    { senderId: 1, senderName: "You", outgoing: true, text: "Works for me." }
  ],
  3001: [
    { senderId: 88, senderName: "Reminder Bot", outgoing: false, text: "Hydration reminder" },
    { senderId: 88, senderName: "Reminder Bot", outgoing: false, text: "Stand up and stretch." }
  ],
  4001: [
    { senderId: 52, senderName: "Mom", outgoing: false, text: "Train arrives at 6." },
    { senderId: 1, senderName: "You", outgoing: true, text: "I'll be there." }
  ],
  5001: [
    { senderId: 1, senderName: "You", outgoing: true, text: "Fix the sync icon on aplite." },
    { senderId: 1, senderName: "You", outgoing: true, text: "Then wire chat fixtures into PKJS." },
    { senderId: 70, senderName: "Notes Bot", outgoing: false, text: "Pinned to project board." }
  ]
});

function copyObject(source) {
  var target = {};
  var key;

  for (key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      target[key] = source[key];
    }
  }

  return target;
}

function cloneChats() {
  var chats = [];
  var index;

  for (index = 0; index < FIXTURE_CHATS.length; index += 1) {
    chats.push(copyObject(FIXTURE_CHATS[index]));
  }

  return chats;
}

function cloneMessages() {
  var pages = {};
  var chatId;
  var messages;
  var copies;
  var index;

  for (chatId in FIXTURE_MESSAGES) {
    if (Object.prototype.hasOwnProperty.call(FIXTURE_MESSAGES, chatId)) {
      messages = FIXTURE_MESSAGES[chatId];
      copies = [];
      for (index = 0; index < messages.length; index += 1) {
        copies.push(copyObject(messages[index]));
      }
      pages[chatId] = addSenderRunMetadata(copies);
    }
  }

  return pages;
}

function createFixtureState() {
  return {
    session: {
      fixtureSession: true,
      phoneNumber: "+15551234567"
    },
    chats: cloneChats(),
    messagePages: cloneMessages()
  };
}

module.exports = {
  createFixtureState: createFixtureState
};
