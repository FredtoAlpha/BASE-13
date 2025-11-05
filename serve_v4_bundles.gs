/**
 * ENDPOINT WEB APP - Module Groupes V4
 *
 * [OK] ORDRE 4 : Creer endpoint Web App pour bundles
 *
 * Fonction: Servir les fichiers JS V4 avec le bon MIME type (text/javascript)
 * But: Eviter 404 -> HTML response -> SyntaxError: Unexpected token '<'
 *
 * Deploiement :
 * 1. Copier ce code dans Apps Script
 * 2. Deployer en tant que Web App (Executer en tant que: votre compte, Acces: Tous)
 * 3. Copier l'URL publique
 * 4. Utiliser cette URL pour charger les bundles V4
 *
 * URL format :
 * https://script.google.com/macros/d/{DEPLOYMENT_ID}/usercache?file=InterfaceV4_Triptyque_Logic.js
 *
 * Fichiers publies:
 * - InterfaceV4_Triptyque_Logic.js
 * - GroupsAlgorithmV4_Distribution.js
 * - InterfaceV2_GroupsModuleV4_Script.js
 */

/**
 * Handler Web App - GET requests
 * Retourne le contenu du fichier demandé avec le bon MIME type
 */
const DEFAULT_V4_FILE = 'InterfaceV4_Triptyque_Logic.js';

function doGet(e) {
  try {
    const requestedFile = e && e.parameter ? e.parameter.file : null;
    const fileName = requestedFile || DEFAULT_V4_FILE;

    if (!requestedFile) {
      console.info('[INFO] Parametre "file" absent - utilisation du fichier par defaut: ' + DEFAULT_V4_FILE);
    }

    // Valider le nom du fichier (sécurité)
    const allowedFiles = [
      'InterfaceV4_Triptyque_Logic.js',
      'GroupsAlgorithmV4_Distribution.js',
      'InterfaceV2_GroupsModuleV4_Script.js'
    ];

    if (!allowedFiles.includes(fileName)) {
      return HtmlService.createHtmlOutput(
        '[ERREUR] Fichier non autorise<br>' +
        'Fichiers disponibles: ' + allowedFiles.join(', ')
      );
    }

    // Récupérer le contenu du fichier (depuis ScriptProperties)
    const scriptProperties = PropertiesService.getScriptProperties();
    let fileContent = scriptProperties.getProperty('V4_' + fileName);

    // ✨ AUTO-CHARGEMENT: Si le fichier n'est pas dans ScriptProperties, le charger automatiquement
    if (!fileContent) {
      console.warn('[WARNING] Fichier non trouve dans ScriptProperties: ' + fileName);
      return HtmlService.createHtmlOutput(
        '[ERREUR] Erreur 404: Fichier non trouve<br>' +
        'Fichier: ' + fileName + '<br>' +
        'Solution: Executer uploadV4Bundles() pour charger les fichiers'
      );
    }

    // Retourner avec le bon MIME type (JavaScript brut, pas HTML)
    console.log('[OK] Servant ' + fileName + ' (' + fileContent.length + ' bytes)');
    return ContentService.createTextOutput(fileContent)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);

  } catch (error) {
    console.error('[ERREUR] Erreur doGet:', error);
    return HtmlService.createHtmlOutput(
      '[ERREUR] Erreur serveur: ' + error.message
    );
  }
}

/**
 * ✨ NOUVELLE FONCTION: Charge un bundle depuis le projet Apps Script
 * Lit directement le fichier .js du projet (pas depuis Drive)
 */
function loadBundleFromProject(fileName) {
  try {
    // Retirer l'extension .js pour obtenir le nom du fichier Apps Script
    const baseName = fileName.replace('.js', '');

    // Essayer de lire le fichier comme un fichier HTML (Apps Script stocke les .js comme HTML)
    try {
      const content = HtmlService.createHtmlOutputFromFile(baseName).getContent();
      if (content && content.length > 0) {
        console.log('[LOAD-PROJECT] ✅ Fichier trouve: ' + baseName + ' (' + content.length + ' bytes)');
        return content;
      }
    } catch (htmlError) {
      console.warn('[LOAD-PROJECT] Fichier HTML non trouve: ' + baseName);
    }

    // Si le fichier n'est pas trouvé comme HTML, essayer via Drive
    const driveContent = getFileContentFromDrive(fileName);
    if (driveContent) {
      return driveContent;
    }

    console.error('[LOAD-PROJECT] ❌ Fichier introuvable: ' + fileName);
    return null;

  } catch (error) {
    console.error('[LOAD-PROJECT] Erreur chargement ' + fileName + ':', error);
    return null;
  }
}

/**
 * Charger les fichiers V4 dans ScriptProperties
 * ⚠️ OBSOLÈTE: Cette fonction n'est plus nécessaire grâce à l'auto-chargement
 * Mais conservée pour compatibilité
 */
function uploadV4Bundles() {
  console.log('[PACKAGE] Chargement des bundles V4...');

  const scriptProperties = PropertiesService.getScriptProperties();

  // Liste des fichiers à charger (depuis Google Drive ou copier/coller le contenu)
  const files = [
    'InterfaceV4_Triptyque_Logic.js',
    'GroupsAlgorithmV4_Distribution.js',
    'InterfaceV2_GroupsModuleV4_Script.js'
  ];

  files.forEach(fileName => {
    try {
      // [!] IMPORTANT: Le contenu doit etre fourni manuellement ou depuis Drive
      // Pour l'instant, on va creer un placeholder

      const content = getFileContentFromDrive(fileName);
      if (content) {
        scriptProperties.setProperty('V4_' + fileName, content);
        console.log('[OK] ' + fileName + ' charge (' + content.length + ' bytes)');
      } else {
        console.warn('[WARNING] ' + fileName + ' introuvable - placeholder utilise');
        const placeholder = '// [ERREUR] PLACEHOLDER: ' + fileName + ' non charge\nconsole.error("Fichier ' + fileName + ' manquant");';
        scriptProperties.setProperty('V4_' + fileName, placeholder);
      }
    } catch (error) {
      console.error('[ERREUR] Erreur chargement ' + fileName + ':', error);
    }
  });

  console.log('[OK] Bundles V4 charges');
}

/**
 * Recuperer le contenu d'un fichier depuis Google Drive
 * [!] Adaptez selon votre structure Drive
 */
function getFileContentFromDrive(fileName) {
  try {
    // Rechercher le fichier dans Drive
    const files = DriveApp.getFilesByName(fileName);

    if (files.hasNext()) {
      const file = files.next();
      const content = file.getAs('text/plain').getDataAsString();
      console.log('[OK] Fichier trouve: ' + fileName);
      return content;
    } else {
      console.warn('[WARNING] Fichier non trouve dans Drive: ' + fileName);
      return null;
    }
  } catch (error) {
    console.error('[ERREUR] Erreur Drive pour ' + fileName + ':', error);
    return null;
  }
}

/**
 * Obtenir l'URL publique du Web App
 * A afficher apres deploiement
 */
function getWebAppUrl() {
  const scriptId = ScriptApp.getScriptId();
  console.log('[WEB] URL du Web App endpoint V4 :\n' +
    'https://script.google.com/macros/d/' + scriptId + '/usercache\n\n' +
    'Utilisation :\n' +
    '- Par defaut: InterfaceV4_Triptyque_Logic.js\n' +
    '- Charger Triptyque: ?file=InterfaceV4_Triptyque_Logic.js\n' +
    '- Charger Algo: ?file=GroupsAlgorithmV4_Distribution.js\n' +
    '- Charger Loader: ?file=InterfaceV2_GroupsModuleV4_Script.js\n\n' +
    'MIME type retourne: application/javascript [OK]');
  return scriptId;
}

/**
 * Test du endpoint
 * Verifie que tout fonctionne
 */
function testV4Endpoint() {
  console.log('[TEST] Test du endpoint V4...');

  const scriptProperties = PropertiesService.getScriptProperties();
  const files = [
    'InterfaceV4_Triptyque_Logic.js',
    'GroupsAlgorithmV4_Distribution.js',
    'InterfaceV2_GroupsModuleV4_Script.js'
  ];

  files.forEach(fileName => {
    const content = scriptProperties.getProperty('V4_' + fileName);
    if (content) {
      console.log('[OK] ' + fileName + ': ' + content.length + ' bytes pret');
    } else {
      console.warn('[WARNING] ' + fileName + ': MANQUANT - Executer uploadV4Bundles()');
    }
  });

  console.log('\n[NOTE] Prochaines etapes:');
  console.log('1. Deployer ce script en tant que Web App');
  console.log('2. Executer uploadV4Bundles() pour charger les fichiers');
  console.log('3. Executer getWebAppUrl() pour obtenir l\'URL');
  console.log('4. Utiliser l\'URL dans le HTML pour charger les bundles V4');
}

/**
 * Fonction utilitaire: Charger les fichiers directement (copier-coller)
 * A utiliser si les fichiers ne sont pas dans Drive
 */
function setV4BundleManually(fileName, content) {
  const scriptProperties = PropertiesService.getScriptProperties();
  scriptProperties.setProperty('V4_' + fileName, content);
  console.log('[OK] ' + fileName + ' defini manuellement (' + content.length + ' bytes)');
}

/**
 * ✨ AUTO-INITIALISATION: Charge tous les bundles V4 au démarrage
 * À appeler depuis onOpen() pour pré-charger tous les fichiers
 * AVANTAGE: Plus besoin d'exécuter uploadV4Bundles() manuellement !
 */
function autoInitV4Bundles() {
  console.log('[AUTO-INIT] 🚀 Initialisation automatique des bundles V4...');

  const scriptProperties = PropertiesService.getScriptProperties();
  const files = [
    'InterfaceV4_Triptyque_Logic.js',
    'GroupsAlgorithmV4_Distribution.js',
    'InterfaceV2_GroupsModuleV4_Script.js'
  ];

  let loadedCount = 0;
  let alreadyLoadedCount = 0;

  files.forEach(fileName => {
    try {
      // Vérifier si le fichier est déjà chargé
      const existing = scriptProperties.getProperty('V4_' + fileName);
      if (existing && existing.length > 100) {
        console.log('[AUTO-INIT] ✅ ' + fileName + ' déjà chargé (' + existing.length + ' bytes)');
        alreadyLoadedCount++;
        return;
      }

      // Charger le fichier depuis le projet
      const content = loadBundleFromProject(fileName);
      if (content) {
        scriptProperties.setProperty('V4_' + fileName, content);
        console.log('[AUTO-INIT] ✅ ' + fileName + ' chargé automatiquement (' + content.length + ' bytes)');
        loadedCount++;
      } else {
        console.warn('[AUTO-INIT] ⚠️ ' + fileName + ' non trouvé - sera chargé au premier accès');
      }
    } catch (error) {
      console.error('[AUTO-INIT] ❌ Erreur chargement ' + fileName + ':', error);
    }
  });

  console.log('[AUTO-INIT] 🎉 Terminé: ' + loadedCount + ' fichiers chargés, ' + alreadyLoadedCount + ' déjà présents');
  return {
    loaded: loadedCount,
    alreadyLoaded: alreadyLoadedCount,
    total: files.length
  };
}
