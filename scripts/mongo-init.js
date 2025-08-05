// MongoDB initialization script
print('Creating initial users and schema...');
db = db.getSiblingDB('private-messaging');

db.createCollection('users');
db.createCollection('conversations');
db.createCollection('messages');
db.createCollection('files');

// Add indexes
print('Adding indexes...');
db.users.createIndex({ email: 1 }, { unique: true });
db.messages.createIndex({ conversationId: 1 });
