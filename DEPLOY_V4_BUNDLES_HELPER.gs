/**
 * 🚀 SCRIPT DE DÉPLOIEMENT SIMPLIFIÉ DES BUNDLES V4
 *
 * INSTRUCTIONS D'UTILISATION:
 *
 * 1. Copier ce fichier dans votre projet Google Apps Script
 * 2. Exécuter la fonction: deployAllV4BundlesFromGitHub()
 * 3. Vérifier les logs pour confirmer le succès
 * 4. Tester avec: testV4BundlesLoaded()
 *
 * Ce script charge les fichiers directement depuis GitHub (pas besoin de les copier manuellement!)
 */

/**
 * 🎯 FONCTION PRINCIPALE - Charge tous les bundles V4 depuis GitHub
 * C'est la seule fonction que vous devez exécuter !
 */
function deployAllV4BundlesFromGitHub() {
  console.log('🚀 [DEPLOY] Début du déploiement des bundles V4 depuis GitHub...');

  // ⚠️ IMPORTANT: Après le merge de la PR, changez 'claude/fix-missing-v4-bundles-011CUq19g3N9dwURqME4yXvZ' en 'main'
  const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/FredtoAlpha/BASE-13/claude/fix-missing-v4-bundles-011CUq19g3N9dwURqME4yXvZ/';

  const files = [
    'InterfaceV4_Triptyque_Logic.js',
    'GroupsAlgorithmV4_Distribution.js',
    'InterfaceV2_GroupsModuleV4_Script.js'
  ];

  const scriptProperties = PropertiesService.getScriptProperties();
  let successCount = 0;
  let failCount = 0;

  files.forEach(fileName => {
    try {
      const url = GITHUB_RAW_BASE + encodeURIComponent(fileName);
      console.log('[DEPLOY] Téléchargement: ' + fileName);
      console.log('[DEPLOY] URL: ' + url);

      const response = UrlFetchApp.fetch(url);
      const content = response.getContentText();

      if (content && content.length > 100) {
        scriptProperties.setProperty('V4_' + fileName, content);
        console.log('[DEPLOY] ✅ ' + fileName + ' téléchargé et sauvegardé (' + content.length + ' bytes)');
        successCount++;
      } else {
        console.error('[DEPLOY] ❌ ' + fileName + ' - Contenu vide ou invalide');
        failCount++;
      }
    } catch (error) {
      console.error('[DEPLOY] ❌ Erreur pour ' + fileName + ': ' + error.message);
      failCount++;
    }
  });

  console.log('🎉 [DEPLOY] Terminé!');
  console.log('📊 [DEPLOY] Résultats: ' + successCount + ' succès, ' + failCount + ' échecs sur ' + files.length + ' fichiers');

  if (successCount === files.length) {
    console.log('✅ [DEPLOY] TOUS LES FICHIERS SONT CHARGÉS! Le endpoint V4 est prêt à fonctionner.');
    return { status: 'SUCCESS', success: successCount, failed: failCount, total: files.length };
  } else {
    console.warn('⚠️ [DEPLOY] Certains fichiers n\'ont pas pu être chargés. Vérifiez les logs ci-dessus.');
    return { status: 'PARTIAL', success: successCount, failed: failCount, total: files.length };
  }
}

/**
 * 🧪 Test: Vérifie que tous les bundles sont bien chargés
 */
function testV4BundlesLoaded() {
  console.log('🧪 [TEST] Vérification des bundles V4...');

  const scriptProperties = PropertiesService.getScriptProperties();
  const files = [
    'InterfaceV4_Triptyque_Logic.js',
    'GroupsAlgorithmV4_Distribution.js',
    'InterfaceV2_GroupsModuleV4_Script.js'
  ];

  let allOk = true;

  files.forEach(fileName => {
    const content = scriptProperties.getProperty('V4_' + fileName);
    if (content && content.length > 100) {
      console.log('[TEST] ✅ ' + fileName + ': OK (' + content.length + ' bytes)');
    } else {
      console.error('[TEST] ❌ ' + fileName + ': MANQUANT ou INVALIDE');
      allOk = false;
    }
  });

  if (allOk) {
    console.log('✅ [TEST] TOUS LES BUNDLES SONT PRÊTS!');
    console.log('📝 [TEST] Prochaine étape: Déployer le Web App');
    console.log('📝 [TEST] Extensions > Apps Script > Déployer > Nouveau déploiement > Type: Application Web');
  } else {
    console.error('❌ [TEST] Certains bundles sont manquants. Exécutez deployAllV4BundlesFromGitHub()');
  }

  return allOk;
}

/**
 * 🔄 Forcer le rechargement (efface et recharge tout)
 */
function forceReloadAllBundles() {
  console.log('🔄 [RELOAD] Effacement de tous les bundles existants...');

  const scriptProperties = PropertiesService.getScriptProperties();
  const files = [
    'InterfaceV4_Triptyque_Logic.js',
    'GroupsAlgorithmV4_Distribution.js',
    'InterfaceV2_GroupsModuleV4_Script.js'
  ];

  files.forEach(fileName => {
    scriptProperties.deleteProperty('V4_' + fileName);
  });

  console.log('[RELOAD] Bundles effacés. Rechargement depuis GitHub...');
  return deployAllV4BundlesFromGitHub();
}

/**
 * 📋 Afficher les statistiques des bundles
 */
function showBundleStats() {
  console.log('📋 [STATS] Statistiques des bundles V4:');

  const scriptProperties = PropertiesService.getScriptProperties();
  const files = [
    'InterfaceV4_Triptyque_Logic.js',
    'GroupsAlgorithmV4_Distribution.js',
    'InterfaceV2_GroupsModuleV4_Script.js'
  ];

  let totalSize = 0;

  files.forEach(fileName => {
    const content = scriptProperties.getProperty('V4_' + fileName);
    if (content) {
      const size = content.length;
      totalSize += size;
      console.log('[STATS] ' + fileName + ': ' + size + ' bytes (' + Math.round(size/1024) + ' KB)');
    } else {
      console.log('[STATS] ' + fileName + ': NON CHARGÉ');
    }
  });

  console.log('[STATS] Taille totale: ' + totalSize + ' bytes (' + Math.round(totalSize/1024) + ' KB)');
  return { totalSize: totalSize, totalSizeKB: Math.round(totalSize/1024) };
}

/**
 * ℹ️ Afficher les instructions complètes
 */
function showInstructions() {
  console.log('📖 [HELP] INSTRUCTIONS COMPLÈTES:');
  console.log('');
  console.log('1️⃣ PREMIÈRE ÉTAPE: Charger les bundles');
  console.log('   → Exécutez: deployAllV4BundlesFromGitHub()');
  console.log('');
  console.log('2️⃣ DEUXIÈME ÉTAPE: Vérifier le chargement');
  console.log('   → Exécutez: testV4BundlesLoaded()');
  console.log('');
  console.log('3️⃣ TROISIÈME ÉTAPE: Déployer le Web App');
  console.log('   → Allez dans: Déployer > Nouveau déploiement');
  console.log('   → Type: Application Web');
  console.log('   → Exécuter en tant que: Votre compte');
  console.log('   → Accès: Tous (même utilisateurs anonymes)');
  console.log('   → Cliquez sur "Déployer"');
  console.log('');
  console.log('4️⃣ QUATRIÈME ÉTAPE: Obtenir l\'URL');
  console.log('   → Copiez l\'URL du Web App');
  console.log('   → Format: https://script.google.com/macros/s/[ID]/exec');
  console.log('');
  console.log('5️⃣ CINQUIÈME ÉTAPE: Utiliser l\'URL');
  console.log('   → URL par défaut: [URL_WEB_APP]');
  console.log('   → Avec paramètre: [URL_WEB_APP]?file=InterfaceV4_Triptyque_Logic.js');
  console.log('');
  console.log('✅ C\'EST TOUT! Les bundles se chargeront automatiquement au premier accès.');
}
