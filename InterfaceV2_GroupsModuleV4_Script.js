/**
 * MODULE GROUPES V4 - LOADER MINIMAL
 *
 * ✅ ORDRE 2 : Loader minimal < 200 lignes
 * ✅ Responsabilité unique : instancier TriptychGroupsModule
 * ✅ Aucune duplication de logique métier
 *
 * La logique complète réside dans InterfaceV4_Triptyque_Logic.js
 */

(function() {
  'use strict';

  // ✅ DÉTECTION ENVIRONNEMENT NAVIGATEUR (ce code tourne côté client)
  const windowRef = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
  const documentRef = typeof document !== 'undefined' ? document : null;

  if (!windowRef || !documentRef) {
    console.warn('❌ ModuleGroupsV4Loader: environnement navigateur non détecté');
    return;
  }

  console.log('🚀 Chargement du Module Groupes V4 (loader minimal)');

  /**
   * Wrapper minimal autour de TriptychGroupsModule
   * Gère uniquement :
   * - Instanciation du module
   * - Exposition globale
   * - Callbacks simples (open/close)
   */
  class ModuleGroupsV4 {
    constructor() {
      this.triptyque = null;
      this.container = null;
    }

    /**
     * Ouvrir l'interface V4
     */
    open() {
      console.log('🔓 Ouverture du Module V4');

      if (!this.container) {
        // Créer le conteneur principal
        this.container = documentRef.createElement('div');
        this.container.id = 'groups-module-v4';
        this.container.className = 'fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/70 px-4';
        this.container.innerHTML = `
          <div class="w-full max-w-6xl h-[90vh] bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col">
            <!-- Conteneur du module triptyque -->
            <div id="triptyque-root"></div>
          </div>
        `;
        documentRef.body.appendChild(this.container);
      }

      // Afficher le conteneur
      this.container.style.display = 'flex';

      // Instancier TriptychGroupsModule si nécessaire
      if (!this.triptyque) {
        const trRoot = documentRef.querySelector('#triptyque-root');
        if (trRoot && windowRef.TriptychGroupsModule) {
          // Injecter les données V4 si disponibles
          if (windowRef.GROUPS_MODULE_V4_DATA) {
            console.log('✅ Données V4 injectées:', windowRef.GROUPS_MODULE_V4_DATA.classes?.length || 0, 'classes');
          }

          // Créer l'instance du triptyque
          this.triptyque = new windowRef.TriptychGroupsModule(trRoot);
          console.log('✅ TriptychGroupsModule instancié');

          // ✅ ÉTAPE 3 FIX : Écouter l'événement groups:generate
          // et connecter au moteur GroupsAlgorithmV4
          if (trRoot) {
            // ✅ NOTE : Ne pas attacher ici si déjà attaché dans InterfaceV4_Triptyque_Logic.js
            // Vérifier si l'écouteur existe déjà
            if (!trRoot.hasAttribute('data-generate-listener-attached')) {
              trRoot.addEventListener('groups:generate', (event) => {
                console.log('🚀 Event groups:generate reçu avec payload:', event.detail);

                // ✅ BLOC 4 FIX : Test robuste de l'API algorithme
                if (!windowRef.GroupsAlgorithmV4 || typeof windowRef.GroupsAlgorithmV4 !== 'function') {
                  console.error('❌ GroupsAlgorithmV4 non disponible ou non constructible');
                  console.error('   Détails API:', {
                    classExists: typeof windowRef.GroupsAlgorithmV4,
                    isFunction: typeof windowRef.GroupsAlgorithmV4 === 'function',
                    hasGenerateMethod: windowRef.GroupsAlgorithmV4?.prototype?.generateGroups ? 'oui' : 'non'
                  });
                  console.error('   ➜ Vérifier inclusion GroupsAlgorithmV4_Distribution.js');
                  trRoot.dispatchEvent(new CustomEvent('groups:error', {
                    detail: { message: 'Algorithme non disponible - Vérifiez inclusion GroupsAlgorithmV4_Distribution.js' }
                  }));
                  return;
                }

                // Test que l'API attendue existe
                try {
                  const testAlgo = new windowRef.GroupsAlgorithmV4();
                  if (typeof testAlgo.generateGroups !== 'function') {
                    throw new Error('generateGroups() n\'existe pas sur GroupsAlgorithmV4');
                  }
                  console.log('✅ GroupsAlgorithmV4 API validée');
                } catch (testError) {
                  console.error('❌ Erreur validation API GroupsAlgorithmV4:', testError);
                  trRoot.dispatchEvent(new CustomEvent('groups:error', {
                    detail: { message: 'API Algorithme invalide: ' + testError.message }
                  }));
                  return;
                }

                try {
                  // ✅ Transformer le payload du triptyque en payload algorithme
                  const triptychPayload = event.detail;
                  const regroupements = triptychPayload.regroupements || [];

                  console.log('📊 Sources de données disponibles:', {
                    hasSTATE: !!windowRef.STATE,
                    hasClassesData: !!windowRef.STATE?.classesData,
                    hasGROUPS_MODULE_V4_DATA: !!windowRef.GROUPS_MODULE_V4_DATA,
                    hasElevesInGROUPS: !!windowRef.GROUPS_MODULE_V4_DATA?.eleves
                  });

                  // Générer pour chaque regroupement
                  const results = regroupements.map((regroupement) => {
                    console.log(`📋 Traitement du regroupement: ${regroupement.name}`);

                    // ✅ AMÉLIORATION : Récupérer les élèves depuis la source appropriée
                    let students = [];
                    (regroupement.classes || []).forEach((className) => {
                      console.log(`   📚 Chargement de la classe: ${className}`);

                      // Essayer STATE.classesData en premier (InterfaceV2)
                      if (windowRef.STATE?.classesData?.[className]?.eleves) {
                        const classStudents = windowRef.STATE.classesData[className].eleves;
                        console.log(`      ✅ Trouvé ${classStudents.length} élèves dans STATE.classesData`);
                        students = students.concat(classStudents);
                      }
                      // Sinon essayer GROUPS_MODULE_V4_DATA.eleves
                      else if (windowRef.GROUPS_MODULE_V4_DATA?.eleves?.[className]) {
                        const classStudents = windowRef.GROUPS_MODULE_V4_DATA.eleves[className];
                        console.log(`      ✅ Trouvé ${classStudents.length} élèves dans GROUPS_MODULE_V4_DATA`);
                        students = students.concat(classStudents);
                      }
                      else {
                        console.warn(`      ⚠️ Aucun élève trouvé pour la classe ${className}`);
                      }
                    });

                    if (students.length === 0) {
                      console.error(`❌ Aucun élève trouvé pour ${regroupement.name}`);
                      throw new Error(`Aucun élève trouvé pour le regroupement "${regroupement.name}"`);
                    }

                    console.log(`   ✅ Total: ${students.length} élèves`);

                    // Créer payload algorithme
                    const algoPayload = {
                      students: students,
                      scenario: triptychPayload.scenario || 'needs',
                      distributionMode: triptychPayload.mode || 'heterogeneous',
                      numGroups: regroupement.groupCount || 3
                    };

                    console.log(`   🎯 Appel algorithme avec:`, {
                      studentsCount: students.length,
                      scenario: algoPayload.scenario,
                      mode: algoPayload.distributionMode,
                      numGroups: algoPayload.numGroups
                    });

                    // Instancier l'algorithme et générer
                    const algorithm = new windowRef.GroupsAlgorithmV4();
                    const result = algorithm.generateGroups(algoPayload);

                    return {
                      regroupement: regroupement.name,
                      regroupementId: regroupement.id,
                      ...result
                    };
                  });

                  // ✅ Retourner les résultats au triptyque
                  console.log('✅ Génération réussie pour', results.length, 'regroupements');
                  trRoot.dispatchEvent(new CustomEvent('groups:generated', {
                    detail: {
                      success: true,
                      results: results,
                      summary: {
                        regroupementCount: regroupements.length,
                        scenario: triptychPayload.scenario,
                        mode: triptychPayload.mode
                      },
                      timestamp: new Date().toISOString()
                    }
                  }));
                } catch (error) {
                  console.error('❌ Exception génération:', error);
                  trRoot.dispatchEvent(new CustomEvent('groups:error', {
                    detail: { message: error.message, stack: error.stack }
                  }));
                }
              });

              // Marquer comme attaché pour éviter les doublons
              trRoot.setAttribute('data-generate-listener-attached', 'true');
              console.log('✅ Event listener groups:generate attaché au loader');
            } else {
              console.log('ℹ️ Event listener groups:generate déjà attaché');
            }

            console.log('✅ Event listener groups:generate attaché');

            // ✅ ÉTAPE 7 : Brancher les sauvegardes
            // Écouteur pour sauvegarde brouillon
            trRoot.addEventListener('groups:save-draft', (event) => {
              console.log('💾 Sauvegarde brouillon demandée');
              const regroupements = event.detail;

              if (typeof google !== 'undefined' && google.script?.run?.saveCacheData) {
                google.script.run.saveCacheData('groups_v4_draft', JSON.stringify(regroupements));
                console.log('✅ Brouillon sauvegardé dans cache');
              } else {
                console.warn('⚠️ google.script.run non disponible');
              }
            });

            // Écouteur pour sauvegarde finale
            trRoot.addEventListener('groups:save-final', (event) => {
              console.log('📦 Sauvegarde finale demandée');
              const regroupements = event.detail;

              if (typeof google !== 'undefined' && google.script?.run?.saveWithProgressINT) {
                google.script.run.saveWithProgressINT('groups_v4_final', regroupements);
                console.log('✅ Données finales sauvegardées');
              } else {
                console.warn('⚠️ google.script.run non disponible');
              }
            });

            console.log('✅ Event listeners sauvegardes attachés');
          }
        } else {
          console.error('❌ TriptychGroupsModule non disponible');
          if (!windowRef.TriptychGroupsModule) {
            console.error('   ➜ InterfaceV4_Triptyque_Logic.js n\'a pas chargé');
          }
          if (!trRoot) {
            console.error('   ➜ Élément #triptyque-root non trouvé');
          }
          return false;
        }
      }

      return true;
    }

    /**
     * Fermer l'interface V4
     */
    close() {
      console.log('🔒 Fermeture du Module V4');
      if (this.container) {
        this.container.style.display = 'none';
      }
    }

    /**
     * Détruire et nettoyer
     */
    destroy() {
      console.log('♻️ Destruction du Module V4');
      if (this.container && this.container.parentNode) {
        this.container.remove();
      }
      this.triptyque = null;
      this.container = null;
    }
  }

  // ✅ Exposer la classe (pas une instance)
  windowRef.ModuleGroupsV4 = ModuleGroupsV4;

  // Créer une instance globale unique
  windowRef._moduleGroupsV4Instance = null;

  // Helper : obtenir/créer l'instance unique
  windowRef.getModuleGroupsV4 = function() {
    if (!windowRef._moduleGroupsV4Instance) {
      windowRef._moduleGroupsV4Instance = new ModuleGroupsV4();
    }
    return windowRef._moduleGroupsV4Instance;
  };

  // Helper : ouvrir directement
  windowRef.openModuleGroupsV4 = function() {
    const module = windowRef.getModuleGroupsV4();
    return module.open();
  };

  // Helper : fermer directement
  windowRef.closeModuleGroupsV4 = function() {
    const module = windowRef.getModuleGroupsV4();
    return module.close();
  };

  console.log('✅ ModuleGroupsV4 loader chargé (', documentRef ? documentRef.querySelectorAll('*').length : 0, 'éléments DOM)');

})(); // Fin IIFE
