/**
 * LOCAL AUTHENTICATION UTILITY
 * 
 * Simple localStorage-based auth for hackathon demo purposes.
 * NOT FOR PRODUCTION USE.
 */

export interface LocalUser {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: string;
}

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
}

const USERS_KEY = 'aml_users';
const CURRENT_USER_KEY = 'aml_current_user';

// Simple hash function (NOT CRYPTOGRAPHICALLY SECURE - demo only!)
function simpleHash(password: string): string {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(36) + btoa(password).slice(0, 10);
}

// Get all users from localStorage
function getUsers(): LocalUser[] {
  try {
    const data = localStorage.getItem(USERS_KEY);
    return data ? JSON.parse(data) : [];
  } catch (err) {
    console.error('Failed to read users from localStorage', err);
    return [];
  }
}

// Save users to localStorage
function saveUsers(users: LocalUser[]): void {
  try {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  } catch (err) {
    console.error('Failed to save users to localStorage', err);
    throw new Error('Storage unavailable');
  }
}

// Sign up a new user
export function signUp(email: string, password: string, name: string): CurrentUser {
  if (!email || !password || !name) {
    throw new Error('All fields are required');
  }

  if (password.length < 6) {
    throw new Error('Password must be at least 6 characters');
  }

  const users = getUsers();
  
  // Check if user already exists
  if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
    throw new Error('User with this email already exists');
  }

  // Create new user
  const newUser: LocalUser = {
    id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    email: email.toLowerCase(),
    name,
    passwordHash: simpleHash(password),
    createdAt: new Date().toISOString()
  };

  users.push(newUser);
  saveUsers(users);

  // Auto-login
  const currentUser: CurrentUser = {
    id: newUser.id,
    email: newUser.email,
    name: newUser.name
  };

  setCurrentUser(currentUser);
  return currentUser;
}

// Login existing user
export function login(email: string, password: string): CurrentUser {
  if (!email || !password) {
    throw new Error('Email and password are required');
  }

  const users = getUsers();
  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());

  if (!user) {
    throw new Error('Invalid email or password');
  }

  const passwordHash = simpleHash(password);
  if (user.passwordHash !== passwordHash) {
    throw new Error('Invalid email or password');
  }

  const currentUser: CurrentUser = {
    id: user.id,
    email: user.email,
    name: user.name
  };

  setCurrentUser(currentUser);
  return currentUser;
}

// Logout current user
export function logout(): void {
  try {
    localStorage.removeItem(CURRENT_USER_KEY);
  } catch (err) {
    console.error('Failed to logout', err);
  }
}

// Get current logged-in user
export function getCurrentUser(): CurrentUser | null {
  try {
    const data = localStorage.getItem(CURRENT_USER_KEY);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    console.error('Failed to read current user', err);
    return null;
  }
}

// Set current user in localStorage
function setCurrentUser(user: CurrentUser): void {
  try {
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
  } catch (err) {
    console.error('Failed to save current user', err);
    throw new Error('Storage unavailable');
  }
}

// Check if localStorage is available
export function isStorageAvailable(): boolean {
  try {
    const test = '__storage_test__';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch (err) {
    return false;
  }
}
