// utils/api.jsx
const API_BASE_URL = 'http://localhost:5000/api';

// API utility class
class ApiService {
  constructor() {
    this.baseURL = API_BASE_URL;
  }

  // Get authorization header
  getAuthHeader() {
    const token = localStorage.getItem('token');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }

  // Generic request method
  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeader(),
        ...options.headers,
      },
      ...options,
    };

    try {
      const response = await fetch(url, config);
      const data = await response.json();

      if (!response.ok) {
        throw new ApiError(data.message || 'Request failed', response.status, data);
      }

      return {
        success: true,
        data,
        status: response.status,
      };
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      
      throw new ApiError(
        error.message || 'Network error occurred',
        0,
        { originalError: error }
      );
    }
  }

  // GET request
  async get(endpoint, params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = queryString ? `${endpoint}?${queryString}` : endpoint;
    
    return this.request(url, {
      method: 'GET',
    });
  }

  // POST request
  async post(endpoint, data = {}) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // PUT request
  async put(endpoint, data = {}) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // DELETE request
  async delete(endpoint) {
    return this.request(endpoint, {
      method: 'DELETE',
    });
  }

  // Upload file (multipart/form-data)
  async upload(endpoint, formData) {
    const token = localStorage.getItem('token');
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

    return this.request(endpoint, {
      method: 'POST',
      headers, // Don't set Content-Type for FormData
      body: formData,
    });
  }
}

// Custom API Error class
class ApiError extends Error {
  constructor(message, status, data = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }

  // Check if error is due to authentication
  isAuthError() {
    return this.status === 401 || this.status === 403;
  }

  // Check if error is due to validation
  isValidationError() {
    return this.status === 400 && this.data && this.data.errors;
  }

  // Get validation errors
  getValidationErrors() {
    if (this.isValidationError()) {
      return this.data.errors;
    }
    return [];
  }
}

// Create API service instance
const api = new ApiService();

// Authentication API methods
export const authApi = {
  login: (credentials) => api.post('/auth/login', credentials),
  register: (userData) => api.post('/auth/register', userData),
  logout: () => api.post('/auth/logout'),
  getProfile: () => api.get('/auth/profile'),
};

// Messages API methods
export const messagesApi = {
  getMessages: (params = {}) => api.get('/messages', params),
  createMessage: (messageData) => api.post('/messages', messageData),
  updateMessage: (messageId, content) => api.put(`/messages/${messageId}`, { content }),
  deleteMessage: (messageId) => api.delete(`/messages/${messageId}`),
};

// Users API methods
export const usersApi = {
  getOnlineUsers: () => api.get('/users/online'),
  getAllUsers: (params = {}) => api.get('/users', params),
  getUserById: (userId) => api.get(`/users/${userId}`),
};

// Socket connection utility
export const createSocketConnection = (token) => {
  // This would typically use socket.io-client
  // For now, we'll create a mock implementation
  const socket = {
    connected: false,
    listeners: {},
    
    connect() {
      // Mock connection logic
      this.connected = true;
      console.log('Socket connected');
    },
    
    disconnect() {
      this.connected = false;
      this.listeners = {};
      console.log('Socket disconnected');
    },
    
    on(event, callback) {
      if (!this.listeners[event]) {
        this.listeners[event] = [];
      }
      this.listeners[event].push(callback);
    },
    
    off(event, callback) {
      if (this.listeners[event]) {
        this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
      }
    },
    
    emit(event, data) {
      console.log(`Emitting ${event}:`, data);
      // Mock emit logic
    }
  };
  
  return socket;
};

// Request interceptor for handling common errors
api.interceptResponse = (response, error) => {
  if (error && error.isAuthError()) {
    // Handle authentication errors globally
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
  }
  return { response, error };
};

// Helper functions for common operations
export const apiHelpers = {
  // Handle API responses with loading states
  async handleApiCall(apiCall, setLoading, setError) {
    if (setLoading) setLoading(true);
    if (setError) setError(null);

    try {
      const result = await apiCall();
      return { success: true, data: result.data };
    } catch (error) {
      const errorMessage = error.message || 'An error occurred';
      if (setError) setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      if (setLoading) setLoading(false);
    }
  },

  // Format error messages for display
  formatErrorMessage(error) {
    if (error instanceof ApiError) {
      if (error.isValidationError()) {
        const validationErrors = error.getValidationErrors();
        return validationErrors.map(err => err.msg).join(', ');
      }
      return error.message;
    }
    return error.message || 'An unexpected error occurred';
  },

  // Retry mechanism for failed requests
  async retryRequest(apiCall, maxRetries = 3, delay = 1000) {
    let lastError;
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await apiCall();
      } catch (error) {
        lastError = error;
        
        if (error.isAuthError() || i === maxRetries - 1) {
          throw error;
        }
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
      }
    }
    
    throw lastError;
  },

  // Cache management
  cache: new Map(),
  
  async getCachedData(key, apiCall, ttl = 300000) { // 5 minutes default TTL
    const cached = this.cache.get(key);
    const now = Date.now();
    
    if (cached && (now - cached.timestamp) < ttl) {
      return cached.data;
    }
    
    try {
      const result = await apiCall();
      this.cache.set(key, {
        data: result.data,
        timestamp: now
      });
      return result.data;
    } catch (error) {
      // Return cached data if available, even if expired
      if (cached) {
        return cached.data;
      }
      throw error;
    }
  },

  clearCache(key) {
    if (key) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }
  }
};

// Constants for API endpoints
export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: '/auth/login',
    REGISTER: '/auth/register',
    LOGOUT: '/auth/logout',
    PROFILE: '/auth/profile',
  },
  MESSAGES: {
    GET: '/messages',
    CREATE: '/messages',
    UPDATE: (id) => `/messages/${id}`,
    DELETE: (id) => `/messages/${id}`,
  },
  USERS: {
    ONLINE: '/users/online',
    ALL: '/users',
    BY_ID: (id) => `/users/${id}`,
  }
};

// Export the main API instance and error class
export { api, ApiError };
export default api;