/**
 * MODULES LOADER
 * Chargement centralisé de tous les modules JavaScript
 * Architecture modulaire pour InterfaceV2
 */

(function() {
  'use strict';

  console.log('🚀 Chargement des modules InterfaceV2...');

  // Vérification du contexte d'exécution (utile pour Apps Script / tests Node)
  const hasDocument = typeof document !== 'undefined' && typeof document.createElement === 'function';
  const hasWindow = typeof window !== 'undefined';

  if (!hasDocument) {
    console.error('❌ InterfaceV2_ModulesLoader: contexte DOM manquant (document non défini). Arrêt du chargement des modules.');
    return;
  }

  // Liste des modules à charger dans l'ordre
  const modules = [
    'InterfaceV2_SaveProgressManager.js',
    'InterfaceV2_UtilityFunctions.js',
    'InterfaceV2_DragDropHandlers.js',
    'InterfaceV2_GroupsModuleV4_Script.js'
  ];
  
  let loadedCount = 0;
  
  function loadModule(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = () => {
        loadedCount++;
        console.log(`✅ Module chargé (${loadedCount}/${modules.length}): ${src}`);
        resolve();
      };
      script.onerror = () => {
        console.error(`❌ Erreur chargement: ${src}`);
        reject(new Error(`Failed to load ${src}`));
      };
      document.head.appendChild(script);
    });
  }
  
  // Charger tous les modules séquentiellement
  async function loadAllModules() {
    try {
      for (const module of modules) {
        await loadModule(module);
      }
      console.log('✅ Tous les modules chargés avec succès');
      
      // Déclencher un événement personnalisé
      if (hasWindow && typeof window.dispatchEvent === 'function') {
        try {
          window.dispatchEvent(new CustomEvent('interfaceV2ModulesLoaded'));
        } catch (eventError) {
          console.warn('⚠️ Impossible de déclencher l\'évènement interfaceV2ModulesLoaded:', eventError);
        }
      }
    } catch (error) {
      console.error('❌ Erreur lors du chargement des modules:', error);
    }
  }
  
  // Démarrer le chargement
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadAllModules);
  } else {
    loadAllModules();
  }
  
})();
