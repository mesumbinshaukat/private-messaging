// Migration script to update necessary collections or fields in the database.
const mongoose = require('mongoose');
const { User, Device, Session } = require('./models'); // Use the correct paths

// Connect to the database
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/private-messaging', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function runMigration() {
  try {
    // Example migration: Ensure all user emails are lowercase
    await User.updateMany(
      {},
      [{ $set: { email: { $toLower: "$email" } } }],
      { multi: true }
    );

    // Further migration operations (add indexes, update fields, etc.)

    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    mongoose.connection.close();
  }
}

runMigration();
