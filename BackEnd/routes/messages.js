const express = require('express');
const Message = require('../models/Message');
const auth = require('../middleware/auth');
const router = express.Router();

// Send a message
router.post('/', auth, async (req, res) => {
  try {
    const { recipient, content, messageType = 'text' } = req.body;
    
    // Create chat ID (consistent ordering)
    const chatId = [req.user._id, recipient].sort().join('_');
    
    const message = new Message({
      sender: req.user._id,
      recipient,
      content,
      messageType,
      chatId
    });
    
    await message.save();
    await message.populate('sender', 'username avatar');
    await message.populate('recipient', 'username avatar');
    
    res.status(201).json(message);
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get messages for a chat
router.get('/chat/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    
    const chatId = [req.user._id, userId].sort().join('_');
    
    const messages = await Message.find({ chatId })
      .populate('sender', 'username avatar')
      .populate('recipient', 'username avatar')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    res.json(messages.reverse());
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Mark messages as read
router.put('/read/:chatId', auth, async (req, res) => {
  try {
    const { chatId } = req.params;
    
    await Message.updateMany(
      { 
        chatId, 
        recipient: req.user._id, 
        isRead: false 
      },
      { 
        isRead: true, 
        readAt: new Date() 
      }
    );
    
    res.json({ message: 'Messages marked as read' });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get unread message count
router.get('/unread/count', auth, async (req, res) => {
  try {
    const count = await Message.countDocuments({
      recipient: req.user._id,
      isRead: false
    });
    
    res.json({ count });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;