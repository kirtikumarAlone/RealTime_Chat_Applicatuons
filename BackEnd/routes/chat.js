const express = require('express');
const Message = require('../models/Message');
const User = require('../models/User');
const auth = require('../middleware/auth');
const router = express.Router();

// Get all chats for current user
router.get('/', auth, async (req, res) => {
  try {
    // Get all unique chat partners
    const messages = await Message.aggregate([
      {
        $match: {
          $or: [
            { sender: req.user._id },
            { recipient: req.user._id }
          ]
        }
      },
      {
        $sort: { createdAt: -1 }
      },
      {
        $group: {
          _id: '$chatId',
          lastMessage: { $first: '$$ROOT' },
          unreadCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$recipient', req.user._id] },
                    { $eq: ['$isRead', false] }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      },
      {
        $sort: { 'lastMessage.createdAt': -1 }
      }
    ]);

    // Populate user details
    const chats = await Promise.all(
      messages.map(async (chat) => {
        const lastMessage = await Message.findById(chat.lastMessage._id)
          .populate('sender', 'username avatar')
          .populate('recipient', 'username avatar');

        // Determine the other user in the chat
        const otherUserId = lastMessage.sender._id.equals(req.user._id) 
          ? lastMessage.recipient._id 
          : lastMessage.sender._id;

        const otherUser = await User.findById(otherUserId).select('username avatar isOnline lastSeen');

        return {
          chatId: chat._id,
          otherUser,
          lastMessage,
          unreadCount: chat.unreadCount
        };
      })
    );

    res.json(chats);
  } catch (error) {
    console.error('Get chats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;