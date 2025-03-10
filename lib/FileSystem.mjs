import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

class FileSystem {
  /**
   * Find subfolders in the given folder that match the given regex
   * @param {*} startFolder 
   * @param {*} nameRegex 
   * @returns 
   */
  static findSubFolder(startFolder, nameRegex) {
    const regex = new RegExp(nameRegex);
    const subFolders = [];

    function searchFolder(folder) {
      const items = fs.readdirSync(folder, { withFileTypes: true });
      for (const item of items) {
        if (item.isDirectory()) {
          const itemPath = path.join(folder, item.name);
          if (regex.test(item.name)) {
            subFolders.push(itemPath);
          }
          searchFolder(itemPath);
        }
      }
    }

    searchFolder(startFolder);
    return subFolders;
  }

  /**
   * Read style files from a specific theme and style
   * @param {string} themeName - Name of the theme folder
   * @param {string} styleName - Name of the style subfolder
   * @returns {string[]} Array of relative file paths
   */
  static readStyle(themeName, styleName) {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const stylePath = path.join(__dirname, '../data/themes', themeName, 'styles', styleName);

    try {
      const files = [];

      function searchFiles(folderPath) {
        const items = fs.readdirSync(folderPath, { withFileTypes: true });

        for (const item of items) {
          const absolutePath = path.join(folderPath, item.name);
          if (item.isFile()) {
            const relativePath = path.relative(__dirname, absolutePath);
            const subPath = path.relative(stylePath, absolutePath);
            files.push({
              relativePath,
              subPath
            });
          } else if (item.isDirectory()) {
            searchFiles(absolutePath);
          }
        }
      }

      searchFiles(stylePath);
      return files;
    } catch (error) {
      throw new Error(`Error reading style ${styleName} from theme ${themeName}: ${error.message}`);
    }
  }

  /**
  * Read eclipseStyles.json file
  * @returns 
  */

  static async readJsonFileToObject(relativeFilePath) {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const filePath = path.join(__dirname, relativeFilePath);

    try {
      const data = await fs.promises.readFile(filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      throw new Error(`Error reading a JSON file: ${error.message}`);
    }
  }
}

export default FileSystem;