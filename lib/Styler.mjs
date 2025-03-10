import fs from 'node:fs';
import path from 'path';
import FileSystem from './FileSystem.mjs';
import { eclipseBase } from './Config.mjs';
import { MESSAGE_SEVERITY } from './Constants.mjs';
import { fileURLToPath } from 'url';

class Styler {
    #messages = [];
    #eclipseFolder = null;
    #backupFolder = null;
    #eclipseThemeFolder = null;
    #uiPluginVersion = null;

    /**
     * Setup Styler with Eclipse and Backup Directories
     * @param {*} eclipsedir Eclipse Installation Folder
     * @param {*} backupdir Folder where the original files will be backed up before patching
     */
    constructor(eclipsedir, backupdir) {
        // Validate Input 
        try {
            if (!fs.existsSync(eclipsedir)) {
                throw new Error(`Directory ${eclipsedir} not found`);
            }
        } catch (err) {
            throw err;
        }
        this.#eclipseFolder = eclipsedir;

        try {
            if (!fs.existsSync(backupdir)) {
                throw new Error(`Directory ${backupdir} not found`);
            }
        } catch (err) {
            throw err;
        }

        this.#backupFolder = backupdir;
    }

    /**
     * Backup original Eclipse style files and Patch with new styles
     * @param {*} theme Theme to patch (dark/light)
     * @param {*} style stye to apply (sapdev etc.)
     * @returns 
     */
    async patch(theme, style) {
        const eclipseFolder = this.#eclipseFolder;

        if (theme !== 'dark' && theme !== 'light') {
            throw new Error(`Invalid theme: ${theme}`);
        }

        // Latest update folder, in some cases multiple theme folders are found, some of them half installed/removed after updates
        let themeFolders = FileSystem.findSubFolder(eclipseFolder, eclipseBase.uiThemesPluginFolderRegex)
            .sort((a, b) => a.localeCompare(b) * -1);


        if (!themeFolders.length) {
            throw new Error(`No theme folders found in ${eclipseFolder}`);
        } else {
            this.#eclipseThemeFolder = themeFolders[0];
            this.#uiPluginVersion = path.basename(this.#eclipseThemeFolder);
        }

        // Fetch Eclipse Theme Style File List
        let styleFiles = FileSystem.readStyle(theme, style);
        if (!styleFiles.length) {
            throw new Error(`Theme: ${theme}, Style: ${style} not found`);
        }

        // Each Style Must Contain a metadata file as well with a predefined format, that contains the Supported UI Plugin Versions
        const metadataJsonFile = styleFiles.find(file => file.relativePath.endsWith('adtsMeta.json'));
        if (!metadataJsonFile) {
            throw new Error(`No metadata file (adtsMeta.json) found for theme ${theme} and style ${style}`);
        }

        const styleMetaData = await FileSystem.readJsonFileToObject(metadataJsonFile.relativePath);

        // Check if current UI Plugin version is supported
        if (!styleMetaData.supportedVersions.includes(this.#uiPluginVersion)) {
            this.#addMessage(MESSAGE_SEVERITY.WARNING, 'Your eclipse version is not supported by the selected style');
            this.#addMessage(MESSAGE_SEVERITY.INFO, 'No changes performed');            
            return this.#messages;
        }

        // Remove the metadata file from the file list, it is not part of Eclipse, but ADT Styles only
        styleFiles = styleFiles.filter(file => !file.relativePath.endsWith('adtsMeta.json'));

        // Backup Eclipse Theme Styles
        if (await this.#backupEclipseStyles(styleFiles)) {
            return this.#messages;
        }


        // Patch Eclipse Theme Styles
        await this.#patchEclipseStyles(styleFiles);

        return this.#messages;
    }
    /**
     * Collect files from the eclipse installation folder which will be patched
     * and copy them to the backup folder
     * @param {*} styleFiles 
     * @returns 
     */
    async #backupEclipseStyles(styleFiles) {
        const that = this;

        try {
            await Promise.all(styleFiles.map(async (file) => {
                const cssPath = path.join(that.#eclipseThemeFolder, file.subPath);
                const pluginFolderName = path.basename(that.#eclipseThemeFolder);
                const backupPath = path.join(that.#backupFolder, pluginFolderName, file.subPath + '.bak');
                if (fs.existsSync(backupPath)) {
                    that.#addMessage(MESSAGE_SEVERITY.INFO, `Backup file already exists, skipping: ${backupPath}`);
                    return;
                }
                that.#addMessage(MESSAGE_SEVERITY.INFO, `Backing up CSS file: ${cssPath} to ${backupPath}`);

                // Create directory structure if it doesn't exist
                await fs.promises.mkdir(path.dirname(backupPath), { recursive: true });

                await fs.promises.copyFile(cssPath, backupPath);
                that.#addMessage(MESSAGE_SEVERITY.SUCCESS, 'CSS file backed up successfully');
            }));
            return false;
        } catch (err) {
            that.#addMessage(MESSAGE_SEVERITY.ERROR, `Error backing up CSS file: ${err.message}`);
            return true;
        }
    }

    /**
     * Take the CSS files from the style folder and overwrite the styles in the eclipse installation folder
     * @param {*} styleFiles 
     */
    async #patchEclipseStyles(styleFiles) {
        const that = this;
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);

        try {
            await Promise.all(styleFiles.map(async (file) => {
                let relativePath = path.join(__dirname, file.relativePath);
                const cssPath = path.join(that.#eclipseThemeFolder, file.subPath);
                await fs.promises.copyFile(relativePath, cssPath);
                that.#addMessage(MESSAGE_SEVERITY.SUCCESS, `CSS file: ${cssPath} patched successfully`);
            }));
            return false;
        } catch (err) {
            that.#addMessage(MESSAGE_SEVERITY.ERROR, `Error patching CSS file: ${err.message}`);
            return true;
        }
    }

    /**
     * Take the files from the backup folder and restore them to the eclipse folder
     * @returns 
     */
    async restore() {
        const that = this;
        try {
            // Get all .bak files recursively from backup folder
            const getFilesRecursively = async (dir) => {
                const files = await fs.promises.readdir(dir, { withFileTypes: true });
                const paths = await Promise.all(files.map(async file => {
                    const path_ = path.join(dir, file.name);
                    if (file.isDirectory()) {
                        return getFilesRecursively(path_);
                    }
                    if (file.name.endsWith('.bak')) {
                        return path_;
                    }
                    return null;
                }));
                return paths.flat().filter(Boolean);
            };

            const backupFiles = await getFilesRecursively(this.#backupFolder);

            // Process each backup file
            await Promise.all(backupFiles.map(async (backupFile) => {
                // Get relative path from backup folder
                const relativePath = path.relative(this.#backupFolder, backupFile);
                // Remove .bak extension and create target path
                const targetPath = path.join(
                    this.#eclipseFolder,
                    "plugins",
                    relativePath.slice(0, -4) // remove .bak
                );

                that.#addMessage(MESSAGE_SEVERITY.INFO, `Restoring ${backupFile} to ${targetPath}`);

                // Create target directory if it doesn't exist
                await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });

                // Copy file in overwrite mode
                await fs.promises.copyFile(backupFile, targetPath);
                that.#addMessage(MESSAGE_SEVERITY.SUCCESS, 'File restored successfully');
            }));

        } catch (err) {
            that.#addMessage(MESSAGE_SEVERITY.ERROR, `Error restoring files: ${err.message}`);
        }

        return this.#messages;
    }

    /**
     * Lists all available style directories for a given theme
     * @param {string} theme - The theme type ('dark' or 'light')
     * @returns {string[]} Array of style directory names
     */
    static async listThemeStyles(theme) {
        if (theme !== 'dark' && theme !== 'light') {
            throw new Error(`Invalid theme: ${theme}`);
        }

        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        const stylesPath = path.join(__dirname, `../data/themes/${theme}/styles`);
        
        try {
            const items = await fs.promises.readdir(stylesPath, { withFileTypes: true });
            return items
                .filter(item => item.isDirectory())
                .map(dir => dir.name);
        } catch (err) {
            return [];
        }
    }

    #addMessage(severity, text) {
        this.#messages.push({ severity, text });
    }

}

export default Styler;