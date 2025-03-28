require('dotenv').config(); // Load environment variables from .env file

const { getMACAddress } = require('../models/macadd');
const { MongoClient } = require('mongodb');
const AppUsage = require('../models/appUsage');
const path = require('path');
const exec = require('child_process').exec;
const os = require('os');
const { spawn } = require('child_process');
let trackingProcess;

const MONGODB_URI = process.env.MONGO_URL; // Read MongoDB URI from environment variables

exports.checkMACAddress = async (req, res) => {
  const { macAddress } = req.body;
  try {
    const foundMACAddress = await getMACAddress(macAddress);
    if (foundMACAddress) {
      res.json({ found: true });
    } else {
      res.json({ found: false });
    }
  } catch (error) {
    console.error('Error checking MAC address:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.startTracking = async (req, res) => {
  const { macAddress } = req.body;
  console.log(macAddress);
  if (trackingProcess) {
    return res.status(400).json({ message: 'Tracking already active' });
  }

  const pythonScriptPath = path.join(__dirname, 'track_apps.py');

  trackingProcess = spawn('python', [pythonScriptPath, macAddress]);

  trackingProcess.stdout.on('data', (data) => {
    console.log(`stdout: ${data}`);
  });

  trackingProcess.stderr.on('data', (data) => {
    console.error(`stderr: ${data}`);
  });

  trackingProcess.on('close', (code) => {
    console.log(`child process exited with code ${code}`);
    trackingProcess = null;
  });

  res.json({ message: 'Tracking started' });
};

exports.stopTracking = async (req, res) => {
  if (!trackingProcess) {
    return res.status(400).json({ message: 'Tracking is not active' });
  }

  // Handle errors that occur during the kill operation
  try {
    trackingProcess.kill('SIGINT');
  } catch (err) {
    console.error(
      'Error occurred while trying to kill the tracking process:',
      err
    );
    return res.status(500).json({ error: 'Error stopping tracking process' });
  }

  // Wait for the process to exit
  trackingProcess.on('exit', (code, signal) => {
    console.log(
      `Tracking process exited with code ${code} and signal ${signal}`
    );
    trackingProcess = null; // Reset the reference to the tracking process
    res.json({ message: 'Tracking stopped' });
  });

  // If the process doesn't terminate within a certain timeout, force kill it
  setTimeout(() => {
    if (trackingProcess) {
      try {
        trackingProcess.kill('SIGKILL');
      } catch (err) {
        console.error(
          'Error occurred while forcefully killing the tracking process:',
          err
        );
      } finally {
        trackingProcess = null; // Reset the reference to the tracking process
      }
    }
  }, 5000); // 5 seconds timeout

  console.log('Stopping tracking...');
};

exports.getTracking = async (req, res) => {
  console.log(req.body);
  const { macAddress } = req.body;
  console.log(macAddress);
  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();

    const database = client.db(macAddress);
    const collection = database.collection('process_details_' + macAddress);

    // Fetch data
    const data = await collection.find().toArray();
    console.log(data);
    res.json(data);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  } finally {
    // Close the database connection
    await client.close();
  }
};

exports.deleteLogs = async (req, res) => {
  console.log('Request body:', req.body);
  const { macAddress, startTimestamp, endTimestamp } = req.body;

  if (!macAddress || !startTimestamp || !endTimestamp) {
    return res.status(400).json({ message: 'Missing required parameters' });
  }

  const client = new MongoClient(MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 30000,
  });

  try {
    await client.connect();

    const database = client.db(macAddress);
    const collection = database.collection('process_details_' + macAddress);

    // Convert to ISO format and then to Date objects
    const startDate = new Date(new Date(startTimestamp).toISOString());
    const endDate = new Date(new Date(endTimestamp).toISOString());

    // Debug: Check the actual date objects being used
    console.log('Searching between:', {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
    });

    // First find some sample documents to verify timestamp format
    const sampleDoc = await collection.findOne({}, { sort: { timestamp: -1 } });
    console.log(
      'Sample document timestamp:',
      sampleDoc?.timestamp,
      'Type:',
      typeof sampleDoc?.timestamp
    );

    // Count documents in range
    const count = await collection.countDocuments({
      timestamp: {
        $gte: startDate,
        $lte: endDate,
      },
    });
    console.log(`Found ${count} documents to delete`);

    if (count === 0) {
      return res.status(404).json({
        success: false,
        message: 'No documents found in specified time range',
        query: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
        },
        sampleTimestamp: sampleDoc?.timestamp,
      });
    }

    // Perform deletion
    const deleteResult = await collection.deleteMany({
      timestamp: {
        $gte: startDate,
        $lte: endDate,
      },
    });

    console.log(`Deleted ${deleteResult.deletedCount} documents`);
    return res.json({
      success: true,
      deletedCount: deleteResult.deletedCount,
      message: `Deleted ${deleteResult.deletedCount} logs`,
      timeRange: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      },
    });
  } catch (error) {
    console.error('Delete error:', error);
    return res.status(500).json({
      success: false,
      message: 'Delete operation failed',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  } finally {
    await client
      .close()
      .catch((err) => console.error('Error closing connection:', err));
  }
};

exports.displayBrowserHistory = async (req, res) => {
  console.log(req.body);
  const { macAddress } = req.body;
  console.log(macAddress);
  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();

    const database = client.db(macAddress);
    const collection = database.collection('browser_history_' + macAddress);

    // Fetch data
    const data = await collection.find().toArray();
    console.log(data);
    res.json(data);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  } finally {
    // Close the database connection
    await client.close();
  }
};

exports.checkSystemHealth = async (req, res) => {
  console.log(req.body);
  const { macAddress } = req.body;
  console.log(macAddress);
  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();

    const database = client.db(macAddress);
    const collection = database.collection('system_health_' + macAddress);

    // Fetch data
    const data = await collection.find().toArray();
    console.log(data);
    res.json(data);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  } finally {
    // Close the database connection
    await client.close();
  }
};

exports.displayNetworkDetails = async (req, res) => {
  console.log(req.body);
  const { macAddress } = req.body;
  console.log(macAddress);
  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();

    const database = client.db(macAddress);
    const collection = database.collection('network_details_' + macAddress);

    // Fetch data
    const data = await collection.find().toArray();
    console.log(data);
    res.json(data);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  } finally {
    // Close the database connection
    await client.close();
  }
};

exports.displayNetworkRequests = async (req, res) => {
  console.log(req.body);
  const { macAddress } = req.body;
  console.log(macAddress);
  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();

    const database = client.db(macAddress);
    const collection = database.collection('network_requests_' + macAddress);

    // Fetch data
    const data = await collection.find().toArray();
    console.log(data);
    res.json(data);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  } finally {
    // Close the database connection
    await client.close();
  }
};

exports.displayFailureAlerts = async (req, res) => {
  console.log(req.body);
  const { macAddress } = req.body;
  console.log(macAddress);
  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();

    const database = client.db(macAddress);
    const collection = database.collection('failure_alerts_' + macAddress);

    // Fetch data
    const data = await collection.find().toArray();
    console.log(data);
    res.json(data);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  } finally {
    // Close the database connection
    await client.close();
  }
};

exports.displayConnectedDevices = async (req, res) => {
  console.log(req.body);
  const { macAddress } = req.body;
  console.log(macAddress);
  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();

    const database = client.db(macAddress);
    const collection = database.collection(
      'connected_devices_details_' + macAddress
    );

    // Fetch data
    const data = await collection.find().toArray();
    console.log(data);
    res.json(data);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  } finally {
    // Close the database connection
    await client.close();
  }
};

exports.displayCheatingDevices = async (req, res) => {
  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();

    // Connect to the cheating_devices database
    const database = client.db('cheating_devices');

    // Access the cheating_devices collection
    const collection = database.collection('cheating_devices');

    // Fetch data
    const data = await collection.find().toArray();
    console.log(data);
    res.json(data);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  } finally {
    // Close the database connection
    await client.close();
  }
};

exports.shutdownSystem = async (req, res) => {
  let shutdownCommand = '';

  // Check the platform and set the appropriate shutdown command
  if (os.platform() === 'win32') {
    // Windows shutdown command for both win32 and win64
    shutdownCommand = 'shutdown -s -t 0';
  } else if (os.platform() === 'linux' || os.platform() === 'darwin') {
    // Linux and macOS shutdown command
    shutdownCommand = 'sudo shutdown -h now';
  } else {
    return res.status(400).json({ error: 'Unsupported platform for shutdown' });
  }

  // Execute the shutdown command
  exec(shutdownCommand, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error shutting down: ${error}`);
      return res.status(500).json({ error: 'Failed to shut down the system' });
    }
    console.log('System is shutting down...');
    res.status(200).json({ message: 'System is shutting down' });
  });
};
