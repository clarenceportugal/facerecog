import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import https from 'https';
import Database from 'better-sqlite3';
import UserModel from '../models/User';
import { UserService } from '../services/dataService';
import { isOfflineMode } from '../utils/systemMode';
import { processUploadedImageWithBackgroundRemoval, processUserFolderWithBackgroundRemoval } from '../utils/backgroundRemoval';

const router = express.Router();

const facesBasePath = path.join(__dirname, '../../../streaming-server/faces');

const ensureDirectoryExists = (targetPath: string): void => {
  if (!fs.existsSync(targetPath)) {
    fs.mkdirSync(targetPath, { recursive: true });
  }
};

const sanitizeFolderName = (name: string): string =>
  name.replace(/[^a-zA-Z0-9_-]/g, '_') || 'Unknown_User';

const generateFileName = (userFolderPath?: string): string => {
  let fileName: string;
  let attempts = 0;
  const maxAttempts = 10;
  
  do {
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 8);
    const counter = attempts > 0 ? `_${attempts}` : '';
    fileName = `img${timestamp}_${randomId}${counter}.jpg`;
    attempts++;
    
    // Check if file already exists (if folder path provided)
    if (userFolderPath) {
      const filePath = path.join(userFolderPath, fileName);
      if (!fs.existsSync(filePath)) {
        break; // File doesn't exist, we can use this name
      }
    } else {
      break; // No folder path provided, use generated name
    }
  } while (attempts < maxAttempts);
  
  return fileName;
};

const ensureUserFolder = (folderName: string): string => {
  ensureDirectoryExists(facesBasePath);
  const userFolderPath = path.join(facesBasePath, folderName);
  ensureDirectoryExists(userFolderPath);
  return userFolderPath;
};

const writeBufferToUserFolder = (folderPath: string, buffer: Buffer, filename?: string): string => {
  const finalName = filename || generateFileName();
  const destination = path.join(folderPath, finalName);
  fs.writeFileSync(destination, buffer);
  return destination;
};

// Test endpoint to verify API is working
router.get('/test', (req: any, res: any) => {
  res.json({ 
    success: true, 
    message: 'Face routes API is working',
    timestamp: new Date().toISOString()
  });
});

// Debug endpoint to check what data is being received
router.post('/debug', (req: any, res: any) => {
  console.log('🔍 DEBUG ENDPOINT - Request body:', req.body);
  console.log('🔍 DEBUG ENDPOINT - Request headers:', req.headers);
  console.log('🔍 DEBUG ENDPOINT - Content-Type:', req.get('Content-Type'));
  res.json({ 
    message: 'Debug endpoint received data', 
    body: req.body,
    headers: req.headers,
    timestamp: new Date().toISOString()
  });
});

// Check if user folder exists
router.get('/check-folder/:userId', async (req: any, res: any): Promise<void> => {
  try {
    const { userId } = req.params;
    // Uses UserService which works in both online and offline modes
    const user = await UserService.findById(userId);
    
    if (!user) {
      res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
      return;
    }
    
    const fullName = `${user.first_name}_${user.last_name}`.replace(/[^a-zA-Z0-9_-]/g, '_');
    const userFolderPath = path.join(__dirname, '../../../streaming-server/faces', fullName);
    const folderExists = fs.existsSync(userFolderPath);
    
    let files: string[] = [];
    if (folderExists) {
      files = fs.readdirSync(userFolderPath);
    }
    
    res.json({
      success: true,
      user: {
        id: user._id || user.id,
        name: `${user.first_name} ${user.last_name}`,
        folderName: fullName
      },
      folderPath: userFolderPath,
      folderExists: folderExists,
      files: files,
      fileCount: files.length
    });
    
  } catch (error) {
    console.error('Check folder error:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking folder',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

const memoryStorage = multer.memoryStorage();

const fileFilter: multer.Options['fileFilter'] = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'));
  }
};

const upload = multer({
  storage: memoryStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter,
});

const uploadMultiple = multer({
  storage: memoryStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit per file
    files: 10, // Maximum 10 files per request
  },
  fileFilter,
});

// Face registration endpoint
router.post('/register', upload.single('image'), async (req, res): Promise<void> => {
  try {
    const { userId } = req.body;
    const file = req.file;

    if (!userId) {
      res.status(400).json({ 
        success: false, 
        message: 'User ID is required' 
      });
      return;
    }

    if (!file) {
      res.status(400).json({ 
        success: false, 
        message: 'Image file is required' 
      });
      return;
    }

    // Check if user exists - uses UserService which works in both online and offline modes
    const user = await UserService.findById(userId);
    if (!user) {
      res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
      return;
    }

    const folderName = sanitizeFolderName(`${user.first_name}_${user.last_name}`);
    const userFolderPath = ensureUserFolder(folderName);
    const faceImagePath = writeBufferToUserFolder(userFolderPath, file.buffer);

    // Update user's face image path - works in both online and offline modes
    await UserService.update(userId, { faceImagePath: faceImagePath });

    const userName = `${user.first_name} ${user.last_name}`;
    console.log(`[FACE] Face image saved for user ${userName} (${userId}) - Mode: ${isOfflineMode() ? 'OFFLINE' : 'ONLINE'}`);

    // TODO: Here you would typically:
    // 1. Process the image for face recognition
    // 2. Extract face encodings
    // 3. Save encodings to face recognition system
    // 4. Update face recognition database

    res.status(200).json({
      success: true,
      message: `Face registered successfully for ${userName}`,
      faceImagePath: faceImagePath,
      userId: userId,
      userName: userName
    });

  } catch (error) {
    console.error('Face registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Multiple photos upload endpoint for continuous capture
router.post('/register-multiple', uploadMultiple.array('images', 10), async (req, res): Promise<void> => {
  try {
    const { userId, step, userName } = req.body;
    const files = req.files as Express.Multer.File[];

    console.log('🔍 REGISTER-MULTIPLE REQUEST:');
    console.log('🔍 User ID:', userId);
    console.log('🔍 User Name:', userName);
    console.log('🔍 Step:', step);
    console.log('🔍 Files count:', files?.length);
    console.log('🔍 Mode:', isOfflineMode() ? 'OFFLINE' : 'ONLINE');

    if (!userId) {
      res.status(400).json({ 
        success: false, 
        message: 'User ID is required' 
      });
      return;
    }

    if (!files || files.length === 0) {
      res.status(400).json({ 
        success: false, 
        message: 'At least one image file is required' 
      });
      return;
    }

    // Check if user exists - uses UserService which works in both online and offline modes
    const user = await UserService.findById(userId);
    if (!user) {
      res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
      return;
    }

    // Determine the correct folder name
    let folderName: string;
    if (userName && userName !== 'Unknown_User' && userName !== 'undefined' && userName !== 'null') {
      folderName = userName.replace(/[^a-zA-Z0-9_-]/g, '_');
      console.log('✅ Using frontend user name for folder:', folderName);
    } else {
      folderName = `${user.first_name}_${user.last_name}`.replace(/[^a-zA-Z0-9_-]/g, '_');
      console.log('✅ Using database user name for folder:', folderName);
    }

    // Create user folder if it doesn't exist
    const userFolderPath = path.join(__dirname, '../../../streaming-server/faces', folderName);
    if (!fs.existsSync(userFolderPath)) {
      fs.mkdirSync(userFolderPath, { recursive: true });
      console.log('📁 CREATED USER FOLDER:', userFolderPath);
    } else {
      console.log('📁 USING EXISTING USER FOLDER:', userFolderPath);
    }

    // Save files directly into user folder and process with background removal
    const savedFiles = [];
    const processedFiles = [];
    
    for (const file of files) {
      try {
        const newFileName = generateFileName(userFolderPath);
        const originalPath = writeBufferToUserFolder(userFolderPath, file.buffer, newFileName);
        console.log(`📁 SAVED FILE: ${newFileName} in ${userFolderPath}`);
        
        // Save the original image immediately (don't wait for background removal)
        savedFiles.push({
          filename: newFileName,
          path: originalPath,
          size: fs.statSync(originalPath).size,
          originalFilename: newFileName,
          backgroundRemoved: false // Will be updated asynchronously
        });
        
        processedFiles.push({
          original: newFileName,
          processed: newFileName,
          backgroundRemoved: false,
          processing: true
        });
        
        console.log(`✅ SAVED: ${newFileName} (Processing background removal in background)`);
        
        // Process background removal ASYNCHRONOUSLY (don't block the response)
        // This prevents connection timeouts and allows rapid image uploads
        processUploadedImageWithBackgroundRemoval(
          originalPath, 
          userFolderPath, 
          newFileName
        ).then((processResult) => {
          if (processResult.success && processResult.processedPath && processResult.processedPath !== originalPath) {
            // Background removal succeeded - replace original with processed
            const finalPath = processResult.processedPath;
            const finalFileName = path.basename(finalPath);
            
            // Delete the original file with background
            try {
              fs.unlinkSync(originalPath);
              console.log(`🗑️ DELETED original file with background: ${newFileName}`);
            } catch (error) {
              console.log(`⚠️ Could not delete original file: ${error}`);
            }
            
            // Update the saved file info in database (optional - can be done later)
            console.log(`✅ Background removed: ${newFileName} -> ${finalFileName}`);
          } else {
            // Background removal failed or returned original - keep original
            console.log(`⚠️ Background removal failed for ${newFileName}, keeping original image`);
          }
        }).catch((error) => {
          // Background removal error - keep original image
          console.error(`❌ Background removal error for ${newFileName}:`, error);
          console.log(`⚠️ Keeping original image: ${newFileName}`);
        });
        
      } catch (fileError) {
        // If file saving fails, log error but continue with next file
        console.error(`❌ Error processing file ${file.originalname}:`, fileError);
        processedFiles.push({
          original: file.originalname || 'unknown',
          processed: 'ERROR - NOT SAVED',
          backgroundRemoved: false,
          error: fileError instanceof Error ? fileError.message : 'Unknown error'
        });
        // Continue with next file instead of failing entire request
      }
    }

    // Update user record with face images info
    const newFaceImages = savedFiles.map(file => ({
      step: step || 'unknown',
      filename: file.filename,
      path: file.path,
      uploadedAt: new Date()
    }));

    // Handle face images update for both online and offline modes
    if (isOfflineMode()) {
      // For offline mode, get existing face images and append new ones
      const existingImages = user.faceImages || [];
      const updatedImages = [...existingImages, ...newFaceImages];
      await UserService.update(userId, { faceImages: updatedImages } as any);
    } else {
      // For online mode, use MongoDB's $push operator for better performance
      await UserModel.findByIdAndUpdate(
        userId,
        { 
          $push: { 
            faceImages: { $each: newFaceImages } 
          } 
        },
        { 
          runValidators: false, // Bypass validation to avoid course field issues
          new: true 
        }
      );
    }

    const userDisplayName = `${user.first_name} ${user.last_name}`;
    const backgroundRemovedCount = savedFiles.filter(file => file.backgroundRemoved).length;
    
    console.log(`Saved ${savedFiles.length} face images for user ${userDisplayName} (${userId}) in step ${step}`);
    console.log(`📁 Files saved to folder: ${folderName}`);
    console.log(`🎭 Background removed from ${backgroundRemovedCount}/${savedFiles.length} images`);

    res.status(200).json({
      success: true,
      message: `${savedFiles.length} face images saved successfully for ${userDisplayName}`,
      savedFiles: savedFiles,
      processedFiles: processedFiles,
      backgroundRemovalStats: {
        total: savedFiles.length,
        backgroundRemoved: backgroundRemovedCount,
        original: savedFiles.length - backgroundRemovedCount
      },
      userId: userId,
      userName: userDisplayName,
      folderName: folderName,
      step: step
    });

  } catch (error) {
    console.error('Multiple face registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Process user folder with background removal
router.post('/process-background-removal/:userId', async (req, res): Promise<void> => {
  try {
    const { userId } = req.params;
    
    // Check if user exists - uses UserService which works in both online and offline modes
    const user = await UserService.findById(userId);
    if (!user) {
      res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
      return;
    }

    // Determine the correct folder name
    const folderName = `${user.first_name}_${user.last_name}`.replace(/[^a-zA-Z0-9_-]/g, '_');
    const userFolderPath = path.join(__dirname, '../../../streaming-server/faces', folderName);
    
    if (!fs.existsSync(userFolderPath)) {
      res.status(404).json({ 
        success: false, 
        message: 'User face folder not found' 
      });
      return;
    }

    console.log(`🎭 Processing user folder with background removal: ${userFolderPath}`);
    
    // Process the user folder with background removal
    const result = await processUserFolderWithBackgroundRemoval(userFolderPath);
    
    if (result.success) {
      res.status(200).json({
        success: true,
        message: `Background removal completed for ${result.processed_files.length} images`,
        userFolder: userFolderPath,
        processedFiles: result.processed_files,
        failedFiles: result.failed_files,
        totalFiles: result.total_files,
        userId: userId,
        userName: `${user.first_name} ${user.last_name}`
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.message || 'Background removal failed',
        error: result.error
      });
    }

  } catch (error) {
    console.error('Background removal processing error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get face registration status
router.get('/status/:userId', async (req, res): Promise<void> => {
  try {
    const { userId } = req.params;
    
    // Uses UserService which works in both online and offline modes
    const user = await UserService.findById(userId);
    if (!user) {
      res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
      return;
    }

    const hasFaceRegistered = !!user.faceImagePath;

    res.status(200).json({
      success: true,
      hasFaceRegistered,
      faceImagePath: user.faceImagePath || null
    });

  } catch (error) {
    console.error('Face status check error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Delete face registration
router.delete('/delete/:userId', async (req, res): Promise<void> => {
  try {
    const { userId } = req.params;
    
    // Uses UserService which works in both online and offline modes
    const user = await UserService.findById(userId);
    if (!user) {
      res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
      return;
    }

    // Format names for deletion (handle both formats used in the system)
    const folderName = `${user.first_name}_${user.last_name}`.replace(/[^a-zA-Z0-9_-]/g, '_');
    const dbNameFormat = `${user.last_name}, ${user.first_name}`;
    
    // 1. Delete from SQLite database (face_embeddings.db)
    try {
      const dbPath = path.join(__dirname, '../../face_embeddings.db');
      if (fs.existsSync(dbPath)) {
        const db = new Database(dbPath);
        
        // Delete using both name formats (folder format and database format)
        const deleteFolderFormat = db.prepare('DELETE FROM embeddings WHERE person_name = ?');
        const deleteDbFormat = db.prepare('DELETE FROM embeddings WHERE person_name = ?');
        
        deleteFolderFormat.run(folderName);
        deleteDbFormat.run(dbNameFormat);
        
        // Also delete by user_id if available
        const deleteByUserId = db.prepare('DELETE FROM embeddings WHERE user_id = ?');
        deleteByUserId.run(userId.toString());
        
        db.close();
        console.log(`✅ Deleted embeddings from SQLite for: ${folderName} / ${dbNameFormat}`);
      }
    } catch (dbError) {
      console.error('Error deleting from SQLite:', dbError);
      // Continue with other deletions even if SQLite deletion fails
    }

    // 2. Delete the entire face folder from file system
    const userFolderPath = path.join(__dirname, '../../../streaming-server/faces', folderName);
    if (fs.existsSync(userFolderPath)) {
      try {
        // Use recursive deletion to handle files and subdirectories
        if (fs.statSync(userFolderPath).isDirectory()) {
          // Delete all files first (so watcher can detect them)
          const files = fs.readdirSync(userFolderPath);
          files.forEach((file) => {
            const filePath = path.join(userFolderPath, file);
            try {
              const stat = fs.statSync(filePath);
              if (stat.isFile()) {
                fs.unlinkSync(filePath);
                console.log(`✅ Deleted file: ${filePath}`);
              } else if (stat.isDirectory()) {
                fs.rmSync(filePath, { recursive: true, force: true });
                console.log(`✅ Deleted subdirectory: ${filePath}`);
              }
            } catch (fileError) {
              console.error(`Error deleting ${filePath}:`, fileError);
            }
          });
          
          // Remove the empty folder
          fs.rmdirSync(userFolderPath);
          console.log(`✅ Deleted folder: ${userFolderPath}`);
        } else {
          // It's a file, not a folder
          fs.unlinkSync(userFolderPath);
          console.log(`✅ Deleted file: ${userFolderPath}`);
        }
      } catch (folderError) {
        console.error(`Error deleting folder ${userFolderPath}:`, folderError);
        // Try force deletion as fallback
        try {
          fs.rmSync(userFolderPath, { recursive: true, force: true });
          console.log(`✅ Force deleted folder: ${userFolderPath}`);
        } catch (forceError) {
          console.error(`Error force deleting folder:`, forceError);
        }
      }
    }

    // 3. Delete the face image file if it exists (legacy single file)
    if (user.faceImagePath && fs.existsSync(user.faceImagePath)) {
      try {
        fs.unlinkSync(user.faceImagePath);
        console.log(`✅ Deleted legacy face image: ${user.faceImagePath}`);
      } catch (fileError) {
        console.error(`Error deleting legacy face image:`, fileError);
      }
    }

    // 4. Remove face image path from user record - works in both online and offline modes
    await UserService.update(userId, { 
      faceImagePath: undefined, 
      faceImages: [] 
    } as any);

    res.status(200).json({
      success: true,
      message: 'Face registration deleted successfully. Embeddings removed from SQLite, face folder deleted, and user record updated.'
    });

  } catch (error) {
    console.error('Face deletion error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Cleanup Unknown_User folder endpoint
router.delete('/cleanup-unknown-user', async (req, res): Promise<void> => {
  try {
    const unknownUserPath = path.join(__dirname, '../../../streaming-server/faces', 'Unknown_User');
    
    if (!fs.existsSync(unknownUserPath)) {
      res.status(404).json({
        success: false,
        message: 'Unknown_User folder not found'
      });
      return;
    }

    // Get list of files before deletion
    const files = fs.readdirSync(unknownUserPath);
    const fileCount = files.length;
    
    // Delete all files
    files.forEach(file => {
      const filePath = path.join(unknownUserPath, file);
      fs.unlinkSync(filePath);
    });
    
    // Remove the empty folder
    fs.rmdirSync(unknownUserPath);
    
    console.log(`🧹 Cleaned up Unknown_User folder: ${fileCount} files deleted`);
    
    res.status(200).json({
      success: true,
      message: `Unknown_User folder cleaned up successfully. ${fileCount} files deleted.`,
      deletedFiles: fileCount
    });

  } catch (error) {
    console.error('Cleanup error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Debug endpoint to check folder structure
router.get('/debug-folders', async (req, res): Promise<void> => {
  try {
    const facesPath = path.join(__dirname, '../../../streaming-server/faces');
    
    if (!fs.existsSync(facesPath)) {
      res.status(404).json({
        success: false,
        message: 'Faces directory not found'
      });
      return;
    }

    const folders = fs.readdirSync(facesPath, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => {
        const folderPath = path.join(facesPath, dirent.name);
        const files = fs.readdirSync(folderPath);
        return {
          name: dirent.name,
          fileCount: files.length,
          files: files.slice(0, 5) // Show first 5 files
        };
      });

    res.status(200).json({
      success: true,
      message: 'Folder structure retrieved',
      facesPath: facesPath,
      folders: folders
    });

  } catch (error) {
    console.error('Debug folders error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get all embeddings from MongoDB (for syncing to SQLite)
router.get('/all-embeddings', async (req, res): Promise<void> => {
  try {
    // This endpoint would fetch embeddings from MongoDB
    // For now, return empty array - can be enhanced to fetch from MongoDB
    res.json({
      success: true,
      embeddings: [],
      message: 'Embeddings endpoint - to be implemented with MongoDB storage'
    });
  } catch (error) {
    console.error('Error fetching embeddings:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching embeddings',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Sync embeddings to MongoDB (for backup)
router.post('/sync-embeddings', async (req, res): Promise<void> => {
  try {
    const { embeddings } = req.body;
    
    if (!embeddings || !Array.isArray(embeddings)) {
      res.status(400).json({
        success: false,
        message: 'embeddings array is required'
      });
      return;
    }
    
    // TODO: Save embeddings to MongoDB
    // For now, just acknowledge receipt
    console.log(`Received ${embeddings.length} embeddings for MongoDB sync`);
    
    res.json({
      success: true,
      message: `Received ${embeddings.length} embeddings for sync`,
      count: embeddings.length
    });
  } catch (error) {
    console.error('Error syncing embeddings:', error);
    res.status(500).json({
      success: false,
      message: 'Error syncing embeddings',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;

