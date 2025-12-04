import axios from 'axios';
import fs from 'fs';
import path from 'path';

/**
 * Background Removal Utility
 * Handles communication with the Python background removal service
 */

const BACKGROUND_REMOVAL_SERVICE_URL = 'http://localhost:8080';

export interface BackgroundRemovalResult {
  success: boolean;
  message: string;
  processed_image_data?: string;
  original_size?: number;
  processed_size?: number;
  error?: string;
}

export interface UserFolderProcessResult {
  success: boolean;
  message: string;
  user_folder: string;
  processed_files: string[];
  failed_files: string[];
  total_files: number;
  error?: string;
}

/**
 * Check if the background removal service is running
 */
export async function checkBackgroundRemovalService(): Promise<boolean> {
  try {
    const response = await axios.get(`${BACKGROUND_REMOVAL_SERVICE_URL}/health`, {
      timeout: 5000
    });
    return response.status === 200;
  } catch (error) {
    console.log('⚠️ Background removal service not available:', error);
    return false;
  }
}

/**
 * Remove background from a single image
 */
export async function removeBackgroundFromImage(imagePath: string): Promise<BackgroundRemovalResult> {
  try {
    console.log(`🎭 Removing background from: ${imagePath}`);
    
    // Check if service is available
    const serviceAvailable = await checkBackgroundRemovalService();
    if (!serviceAvailable) {
      console.log('⚠️ Background removal service not available, skipping background removal');
      return {
        success: false,
        message: 'Background removal service not available',
        error: 'Service unavailable'
      };
    }
    
    // Read image file
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');
    
    // Send request to background removal service with better error handling
    const response = await axios.post(`${BACKGROUND_REMOVAL_SERVICE_URL}/remove-background`, {
      image_data: base64Image
    }, {
      timeout: 30000 // 30 second timeout for processing
    });
    
    // Check if request was successful
    if (response.status !== 200) {
      console.error(`❌ Background removal service returned status ${response.status}`);
      return {
        success: false,
        message: `Background removal service error: ${response.status}`,
        error: `HTTP ${response.status}`
      };
    }
    
    const data = response.data as BackgroundRemovalResult;
    if (data.success) {
      console.log(`✅ Background removed successfully: ${imagePath}`);
      return data;
    } else {
      console.error(`❌ Background removal failed: ${data.message}`);
      return {
        success: false,
        message: data.message || 'Background removal failed',
        error: data.error
      };
    }
    
  } catch (error: any) {
    // Handle connection reset errors gracefully
    if (error.code === 'ECONNRESET' || error.code === 'ECONNABORTED' || error.message?.includes('aborted')) {
      console.log(`⚠️ Connection reset/aborted for ${imagePath} - this is normal with rapid requests`);
      return {
        success: false,
        message: 'Background removal service connection reset (will retry later)',
        error: 'Connection reset'
      };
    }
    
    console.error(`❌ Error removing background from ${imagePath}:`, error);
    return {
      success: false,
      message: 'Failed to remove background',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Process all images in a user folder with background removal
 */
export async function processUserFolderWithBackgroundRemoval(userFolderPath: string): Promise<UserFolderProcessResult> {
  try {
    console.log(`🎭 Processing user folder with background removal: ${userFolderPath}`);
    
    // Check if service is available
    const serviceAvailable = await checkBackgroundRemovalService();
    if (!serviceAvailable) {
      console.log('⚠️ Background removal service not available, skipping background removal');
      return {
        success: false,
        message: 'Background removal service not available',
        user_folder: userFolderPath,
        processed_files: [],
        failed_files: [],
        total_files: 0,
        error: 'Service unavailable'
      };
    }
    
    // Send request to background removal service
    const response = await axios.post(`${BACKGROUND_REMOVAL_SERVICE_URL}/process-user-folder`, {
      user_folder: userFolderPath
    }, {
      timeout: 60000 // 60 second timeout for folder processing
    });
    
    const data = response.data as UserFolderProcessResult;
    if (data.success) {
      console.log(`✅ User folder processed successfully: ${userFolderPath}`);
      console.log(`📊 Processed: ${data.processed_files.length} files`);
      console.log(`❌ Failed: ${data.failed_files.length} files`);
      return data;
    } else {
      console.error(`❌ User folder processing failed: ${data.message}`);
      return {
        success: false,
        message: data.message || 'User folder processing failed',
        user_folder: userFolderPath,
        processed_files: [],
        failed_files: [],
        total_files: 0,
        error: data.error
      };
    }
    
  } catch (error) {
    console.error(`❌ Error processing user folder ${userFolderPath}:`, error);
    return {
      success: false,
      message: 'Failed to process user folder',
      user_folder: userFolderPath,
      processed_files: [],
      failed_files: [],
      total_files: 0,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Save processed image with background removed
 */
export async function saveProcessedImage(processedImageData: string, outputPath: string): Promise<boolean> {
  try {
    console.log(`💾 Saving processed image: ${outputPath}`);
    
    // Remove data URL prefix if present
    let base64Data = processedImageData;
    if (base64Data.startsWith('data:image')) {
      base64Data = base64Data.split(',')[1];
    }
    
    // Convert base64 to buffer and save
    const imageBuffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(outputPath, imageBuffer);
    
    console.log(`✅ Processed image saved: ${outputPath}`);
    return true;
    
  } catch (error) {
    console.error(`❌ Error saving processed image ${outputPath}:`, error);
    return false;
  }
}

/**
 * Process a single uploaded image with background removal
 */
export async function processUploadedImageWithBackgroundRemoval(
  originalImagePath: string, 
  userFolderPath: string, 
  fileName: string
): Promise<{ success: boolean; processedPath?: string; error?: string }> {
  try {
    console.log(`🎭 Processing uploaded image with background removal: ${fileName}`);
    
    // Remove background
    const result = await removeBackgroundFromImage(originalImagePath);
    
    if (!result.success) {
      console.log(`⚠️ Background removal failed for ${fileName}, keeping original image`);
      return {
        success: true, // Still successful, just using original image
        processedPath: originalImagePath
      };
    }
    
    // Create processed filename
    const fileExt = path.extname(fileName);
    const fileNameWithoutExt = path.basename(fileName, fileExt);
    const processedFileName = `${fileNameWithoutExt}_nobg${fileExt}`;
    const processedPath = path.join(userFolderPath, processedFileName);
    
    // Save processed image
    if (result.processed_image_data) {
      const saveSuccess = await saveProcessedImage(result.processed_image_data, processedPath);
      
      if (saveSuccess) {
        console.log(`✅ Background removed and saved: ${processedFileName}`);
        return {
          success: true,
          processedPath: processedPath
        };
      } else {
        console.log(`⚠️ Failed to save processed image, using original: ${fileName}`);
        return {
          success: true,
          processedPath: originalImagePath
        };
      }
    } else {
      console.log(`⚠️ No processed image data, using original: ${fileName}`);
      return {
        success: true,
        processedPath: originalImagePath
      };
    }
    
  } catch (error) {
    console.error(`❌ Error processing image ${fileName}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
