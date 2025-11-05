/**
 * INTERFACE TRIPTYQUE - MODULE GROUPES V4
 * Architecture permanente en 3 volets avec gestion d'état centralisée
 * Remplace le système de phases successives
 */

(function() {
  'use strict';

  // ✅ DÉTECTION ENVIRONNEMENT NAVIGATEUR (ce code tourne côté client)
  const windowRef = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
  const documentRef = typeof document !== 'undefined' ? document : null;

  if (!windowRef || !documentRef) {
    console.warn('❌ TriptychGroupsModule: environnement navigateur non détecté');
    return;
  }

  // ✅ ORDRE 3 : REFUSER les classes fictives
  // Aucune donnée par défaut - exiger injection réelle depuis backend
  const DEFAULT_CLASSES = null;  // ❌ REFUSÉE - données réelles obligatoires

  // Configuration des scénarios
  const SCENARIOS = {
    needs: {
      id: 'needs',
      title: 'Besoins',
      description: "Équilibrer les besoins spécifiques (accompagnement, PPRE, ULIS…)",
      helper: "Choisissez les classes à prendre en compte dans vos regroupements puis vérifiez l'équilibre des profils."
    },
    lv2: {
      id: 'lv2',
      title: 'LV2',
      description: 'Rassembler les classes selon la langue vivante 2 choisie',
      helper: "Sélectionnez les classes concernées par la LV2 pour orchestrer vos groupes ESP/ITA."
    },
    options: {
      id: 'options',
      title: 'Options',
      description: 'Créer des regroupements autour des enseignements facultatifs',
      helper: "Identifiez les classes où l'option est proposée et composez vos regroupements en conséquence."
    }
  };

  // Configuration des modes de distribution
  const MODES = {
    heterogeneous: {
      id: 'heterogeneous',
      label: 'Hétérogène',
      description: "Distribution équilibrée automatiquement par le moteur (round-robin)."
    },
    homogeneous: {
      id: 'homogeneous',
      label: 'Homogène',
      description: "Constitution de groupes par niveau via les quantiles sélectionnés."
    }
  };

  /**
   * Classe principale du module triptyque
   */
  class TriptychGroupsModule {
    constructor(rootSelector = '#groups-module-v4') {
      this.root = typeof rootSelector === 'string'
        ? documentRef.querySelector(rootSelector)
        : rootSelector;

      if (!this.root) {
        console.warn('❌ TriptychGroupsModule: élément racine introuvable');
        return;
      }

      console.log('🚀 Initialisation TriptychGroupsModule');

      // ✅ BLOC 2 FIX : Résoudre d'abord les classes et vérifier qu'elles existent
      const availableClasses = this.resolveAvailableClasses();

      // ❌ BLOQUER si pas de données - Ne pas utiliser de fallback silencieux
      if (!availableClasses || availableClasses.length === 0) {
        console.error('🚨 BLOCAGE V4 : Aucune donnée de classe disponible');
        this.renderBlockedInterface('❌ Module Groupes V4 - Données non chargées\n\n' +
          'Cause probable:\n' +
          '1. Les données GROUPS_MODULE_V4_DATA n\'ont pas été injectées\n' +
          '2. Ou google.script.run n\'a pas exécuté getGroupsModuleV4Data()\n\n' +
          'Vérifications:\n' +
          '• InterfaceV2.html lignes 1493-1516 : Injection GROUPS_MODULE_V4_DATA?\n' +
          '• Code.js : Fonction getGroupsModuleV4Data() retourne-t-elle des classes?\n' +
          '• Console navigateur : window.GROUPS_MODULE_V4_DATA === ' +
          (typeof windowRef.GROUPS_MODULE_V4_DATA));
        return; // ✅ STOP - Ne pas continuer sans données
      }

      // ✅ ÉTAPE 1 : Créer la structure HTML triptyque 30/40/30 AVANT tout
      this.renderInitialStructure();

      this.state = {
        scenario: 'needs',
        distributionMode: 'heterogeneous',
        regroupementCount: 2,
        regroupements: [],
        availableClasses: availableClasses,
        assignedClasses: [], // Nouvellement ajouté pour colonne B
        currentCarouselIndex: 0, // Nouvellement ajouté pour colonne C
        generationLog: []
      };

      this.ensureRegroupementPool();
      this.cacheDom();
      this.bindStaticEvents();
      this.bindGenerationEvents(); // ✅ BLOC 3 FIX : Écouter les résultats de génération
      this.renderAll();

      console.log('✅ TriptychGroupsModule initialisé avec succès');
    }

    /**
     * Résout les classes disponibles depuis les données injectées ou utilise les valeurs par défaut
     */
    resolveAvailableClasses() {
      // 1. Essayer window.STATE (InterfaceV2)
      if (windowRef.STATE && windowRef.STATE.classesData) {
        const classesFromState = Object.keys(windowRef.STATE.classesData).map(className => ({
          id: className,
          label: className,
          students: windowRef.STATE.classesData[className]?.eleves?.length || 0
        }));
        if (classesFromState.length > 0) {
          console.log('✅ Classes chargées depuis window.STATE:', classesFromState.length);
          return classesFromState;
        }
      }

      // 2. Essayer GROUPS_MODULE_V4_DATA (injection manuelle)
      const injected = windowRef.GROUPS_MODULE_V4_DATA?.classes;
      if (Array.isArray(injected) && injected.length) {
        console.log('✅ Classes chargées depuis GROUPS_MODULE_V4_DATA:', injected.length);
        return injected.map((cls, index) => {
          if (typeof cls === 'string') {
            return { id: cls, label: cls };
          }
          if (cls && typeof cls === 'object') {
            const label = cls.label || cls.name || cls.id || `Classe ${index + 1}`;
            const id = cls.id || cls.code || `cls-${index}`;
            return { id: String(id), label };
          }
          return { id: `cls-${index}`, label: `Classe ${index + 1}` };
        });
      }

      // 3. ❌ REFUSER DEFAULT_CLASSES - exiger injection réelle (ORDRE 3)
      console.error('❌ CRITIQUE : Aucune donnée de classe disponible !');
      console.error('   window.STATE.classesData = ', windowRef.STATE?.classesData);
      console.error('   GROUPS_MODULE_V4_DATA = ', windowRef.GROUPS_MODULE_V4_DATA);
      console.error('   ➜ Phase 1 Fix: Utiliser <?!= include() ?> au lieu de <script src>');
      console.error('   ➜ Phase 2 Fix: Vérifier injection GROUPS_MODULE_V4_DATA ligne 1436 CoreScript.html');
      console.error('   ➜ DEFAULT_CLASSES = ', DEFAULT_CLASSES, '(REFUSÉE - ne sera jamais utilisée)');
      this.state.error = '❌ Données classes manquantes - Module V4 non disponible';
      return [];
    }

    /**
     * S'assure que le nombre de regroupements correspond au paramètre
     */
    ensureRegroupementPool() {
      const { regroupementCount, regroupements } = this.state;
      if (regroupements.length < regroupementCount) {
        const missing = regroupementCount - regroupements.length;
        for (let i = 0; i < missing; i += 1) {
          const index = regroupements.length + 1;
          this.state.regroupements.push({
            id: `regroupement-${index}`,
            name: `Regroupement ${index}`,
            classes: [],
            groupCount: 3,
            notes: '',
            updatedAt: Date.now()
          });
        }
      } else if (regroupements.length > regroupementCount) {
        this.state.regroupements = regroupements.slice(0, regroupementCount);
      }
    }

    /**
     * Cache les références DOM
     */
    cacheDom() {
      this.dom = {
        scenarioButtons: Array.from(this.root.querySelectorAll('[data-scenario]')),
        scenarioHelper: this.root.querySelector('[data-scenario-helper]'),
        modeButtons: Array.from(this.root.querySelectorAll('[data-mode]')),
        modeHelper: this.root.querySelector('[data-mode-helper]'),
        regroupementCountInput: this.root.querySelector('#regroupement-count'),
        regroupementApplyBtn: this.root.querySelector('#apply-regroupement-count'),
        regroupementColumns: this.root.querySelector('#regroupements-columns'),
        regroupementTimeline: this.root.querySelector('#regroupement-timeline'),
        statsContainer: this.root.querySelector('#regroupement-stats'),
        generationLog: this.root.querySelector('#generation-log'),
        generateBtn: this.root.querySelector('#generate-regroupements'),
        resetBtn: this.root.querySelector('#reset-regroupements'),
        summaryScenario: this.root.querySelector('[data-summary-scenario]'),
        summaryMode: this.root.querySelector('[data-summary-mode]'),
        summaryRegroupements: this.root.querySelector('[data-summary-regroupements]'),
        closeButton: this.root.querySelector('#close-module')
      };
    }

    /**
     * Attache les événements statiques
     */
    bindStaticEvents() {
      // Bouton de fermeture
      if (this.dom.closeButton) {
        this.dom.closeButton.addEventListener('click', () => {
          this.appendLog('⏹️ Fermeture de l\'interface Groupes V4.');
          this.root.dispatchEvent(new CustomEvent('groups:close'));
          this.root.style.display = 'none';
        });
      }

      // Boutons de scénario
      this.dom.scenarioButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
          const scenarioId = btn.dataset.scenario;
          if (scenarioId && SCENARIOS[scenarioId]) {
            this.state.scenario = scenarioId;
            this.appendLog(`🎯 Scénario sélectionné : ${SCENARIOS[scenarioId].title}`);
            this.renderScenario();
            this.renderSummary();
          }
        });
      });

      // Boutons de mode
      this.dom.modeButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
          const modeId = btn.dataset.mode;
          if (modeId && MODES[modeId]) {
            this.state.distributionMode = modeId;
            this.appendLog(`⚙️ Mode de distribution : ${MODES[modeId].label}`);
            this.renderModes();
            this.renderSummary();
          }
        });
      });

      // Appliquer le nombre de regroupements
      if (this.dom.regroupementApplyBtn) {
        this.dom.regroupementApplyBtn.addEventListener('click', () => {
          const value = Number(this.dom.regroupementCountInput?.value ?? 0);
          if (Number.isFinite(value) && value >= 1 && value <= 10) {
            this.state.regroupementCount = Math.trunc(value);
            this.ensureRegroupementPool();
            this.appendLog(`➕ Nombre de regroupements fixé à ${this.state.regroupementCount}`);
            this.renderRegroupements();
            this.renderSummary();
          } else {
            this.appendLog('⚠️ Veuillez choisir un nombre de regroupements entre 1 et 10.');
          }
        });
      }

      // Bouton de génération
      if (this.dom.generateBtn) {
        this.dom.generateBtn.addEventListener('click', () => {
          const ready = this.validateRegroupements();
          if (!ready.valid) {
            this.appendLog(`❌ Génération impossible : ${ready.message}`);
            return;
          }
          this.appendLog('🚀 Génération lancée pour tous les regroupements…');

          // ✅ ÉTAPE 3 : Payload complet avec scénario et mode
          const payload = {
            regroupements: this.state.regroupements.map((reg) => ({
              id: reg.id,
              name: reg.name,
              classes: reg.classes,
              groupCount: reg.groupCount
            })),
            scenario: this.state.scenario,
            mode: this.state.distributionMode,
            timestamp: new Date().toISOString()
          };

          const event = new CustomEvent('groups:generate', { detail: payload });
          this.root.dispatchEvent(event);
          this.appendLog('✅ Données prêtes : Scénario=' + payload.scenario + ', Mode=' + payload.mode + ', Regroupements=' + payload.regroupements.length);
        });
      }

      // Bouton de réinitialisation
      if (this.dom.resetBtn) {
        this.dom.resetBtn.addEventListener('click', () => {
          // ✅ FIX: Vider le log DOM avant de réinitialiser
          if (this.dom.generationLog) {
            this.dom.generationLog.innerHTML = '';
          }

          this.state.regroupements = [];
          this.state.generationLog = [];
          this.state.lastGenerationResults = null; // ✅ Réinitialiser les résultats de génération
          this.ensureRegroupementPool();
          this.appendLog('🧽 Réinitialisation complète des regroupements.');
          this.renderRegroupements();
          this.renderSummary();

          // ✅ Vider la preview
          const groupsPreview = this.root.querySelector('#groups-preview');
          if (groupsPreview) {
            groupsPreview.innerHTML = '<p style="color: #64748b; padding: 20px; text-align: center;">Aucun groupe généré</p>';
          }
        });
      }

      // ✅ NOUVEAU : Boutons de navigation du carrousel
      const carouselPrev = this.root.querySelector('#carousel-prev');
      const carouselNext = this.root.querySelector('#carousel-next');

      if (carouselPrev) {
        carouselPrev.addEventListener('click', () => {
          if (!this.state.lastGenerationResults || this.state.lastGenerationResults.length === 0) {
            return;
          }
          this.state.currentCarouselIndex = Math.max(0, (this.state.currentCarouselIndex || 0) - 1);
          this.renderGenerationPreview();
        });
      }

      if (carouselNext) {
        carouselNext.addEventListener('click', () => {
          if (!this.state.lastGenerationResults || this.state.lastGenerationResults.length === 0) {
            return;
          }
          const maxIndex = this.state.lastGenerationResults.length - 1;
          this.state.currentCarouselIndex = Math.min(maxIndex, (this.state.currentCarouselIndex || 0) + 1);
          this.renderGenerationPreview();
        });
      }
    }

    /**
     * Rend tous les composants
     */
    renderAll() {
      if (this.dom.regroupementCountInput) {
        this.dom.regroupementCountInput.value = String(this.state.regroupementCount);
      }
      this.renderScenario();
      this.renderModes();
      this.renderRegroupements();
      this.renderSummary();
    }

    /**
     * Rend la sélection de scénario
     */
    renderScenario() {
      this.dom.scenarioButtons.forEach((btn) => {
        const isActive = btn.dataset.scenario === this.state.scenario;
        btn.classList.toggle('is-active', isActive);
      });

      if (this.dom.scenarioHelper) {
        const scenario = SCENARIOS[this.state.scenario];
        this.dom.scenarioHelper.textContent = scenario?.helper ?? '';
      }
    }

    /**
     * Rend la sélection de mode
     */
    renderModes() {
      this.dom.modeButtons.forEach((btn) => {
        const isActive = btn.dataset.mode === this.state.distributionMode;
        btn.classList.toggle('is-active', isActive);
      });

      if (this.dom.modeHelper) {
        const mode = MODES[this.state.distributionMode];
        this.dom.modeHelper.textContent = mode?.description ?? '';
      }
    }

    /**
     * Rend les regroupements
     */
    renderRegroupements() {
      if (!this.dom.regroupementColumns) {
        return;
      }

      this.dom.regroupementColumns.innerHTML = '';
      this.state.regroupements.forEach((regroupement) => {
        const card = this.buildRegroupementCard(regroupement);
        this.dom.regroupementColumns.appendChild(card);
      });

      this.renderStats();
      this.renderTimeline();
    }

    /**
     * Construit une carte de regroupement
     */
    buildRegroupementCard(regroupement) {
      const card = documentRef.createElement('div');
      card.className = 'regroupement-card';
      card.dataset.regroupementId = regroupement.id;

      // Header
      const header = documentRef.createElement('div');
      header.className = 'regroupement-card__header';
      
      const title = documentRef.createElement('h3');
      title.textContent = regroupement.name;
      header.appendChild(title);

      const actions = documentRef.createElement('div');
      actions.className = 'regroupement-card__actions';

      // Bouton renommer
      const renameBtn = documentRef.createElement('button');
      renameBtn.type = 'button';
      renameBtn.className = 'button-link';
      renameBtn.textContent = 'Renommer';
      renameBtn.addEventListener('click', () => {
        const newName = windowRef.prompt('Nom du regroupement', regroupement.name);
        if (newName) {
          regroupement.name = newName.trim();
          regroupement.updatedAt = Date.now();
          this.appendLog(`✏️ ${regroupement.id} renommé en « ${regroupement.name} ».`);
          this.renderRegroupements();
          this.renderSummary();
        }
      });

      // Bouton dupliquer
      const duplicateBtn = documentRef.createElement('button');
      duplicateBtn.type = 'button';
      duplicateBtn.className = 'button-link';
      duplicateBtn.textContent = 'Dupliquer';
      duplicateBtn.addEventListener('click', () => {
        const clone = {
          ...regroupement,
          id: `regroupement-${this.state.regroupements.length + 1}`,
          name: `${regroupement.name} (copie)`,
          updatedAt: Date.now()
        };
        this.state.regroupements.push(clone);
        this.state.regroupementCount = this.state.regroupements.length;
        this.appendLog(`🗂️ Duplication de ${regroupement.name}.`);
        this.renderAll();
      });

      actions.appendChild(renameBtn);
      actions.appendChild(duplicateBtn);
      header.appendChild(actions);

      // Content
      const content = documentRef.createElement('div');
      content.className = 'regroupement-card__content';

      // Section classes
      const classesSection = documentRef.createElement('div');
      classesSection.className = 'regroupement-card__section';

      const classesTitle = documentRef.createElement('h4');
      classesTitle.textContent = 'Classes associées';
      classesSection.appendChild(classesTitle);

      const classesHint = documentRef.createElement('p');
      classesHint.className = 'regroupement-card__hint';
      classesHint.textContent = "Sélectionnez les classes qui composent ce regroupement.";
      classesSection.appendChild(classesHint);

      const classesList = documentRef.createElement('div');
      classesList.className = 'regroupement-card__classes';

      this.state.availableClasses.forEach((classe) => {
        const checkboxId = `${regroupement.id}-${classe.id}`;
        const wrapper = documentRef.createElement('label');
        wrapper.className = 'regroupement-card__class-item';
        wrapper.setAttribute('for', checkboxId);

        const checkbox = documentRef.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = checkboxId;
        checkbox.value = classe.id;
        checkbox.checked = regroupement.classes.includes(classe.id);
        checkbox.addEventListener('change', (event) => {
          this.toggleClassForRegroupement(regroupement.id, classe.id, event.target.checked);
        });

        const span = documentRef.createElement('span');
        span.textContent = classe.label;

        wrapper.appendChild(checkbox);
        wrapper.appendChild(span);
        classesList.appendChild(wrapper);
      });

      classesSection.appendChild(classesList);

      // Section nombre de groupes
      const groupCountSection = documentRef.createElement('div');
      groupCountSection.className = 'regroupement-card__section';

      const groupCountLabel = documentRef.createElement('label');
      groupCountLabel.textContent = 'Nombre de groupes à générer';
      groupCountLabel.setAttribute('for', `${regroupement.id}-group-count`);
      groupCountSection.appendChild(groupCountLabel);

      const groupCountInput = documentRef.createElement('input');
      groupCountInput.type = 'number';
      groupCountInput.min = '2';
      groupCountInput.max = '10';
      groupCountInput.value = String(regroupement.groupCount);
      groupCountInput.id = `${regroupement.id}-group-count`;
      groupCountInput.addEventListener('change', (event) => {
        const value = Number(event.target.value);
        if (Number.isFinite(value) && value >= 2 && value <= 10) {
          regroupement.groupCount = Math.trunc(value);
          regroupement.updatedAt = Date.now();
          this.appendLog(`📦 ${regroupement.name} : ${regroupement.groupCount} groupes demandés.`);
          this.renderSummary();
        } else {
          event.target.value = String(regroupement.groupCount);
          this.appendLog('⚠️ Le nombre de groupes doit être compris entre 2 et 10.');
        }
      });

      groupCountSection.appendChild(groupCountInput);

      content.appendChild(classesSection);
      content.appendChild(groupCountSection);

      // Footer
      const footer = documentRef.createElement('div');
      footer.className = 'regroupement-card__footer';
      footer.innerHTML = `
        <p>🕒 Mise à jour : <strong>${new Intl.DateTimeFormat('fr-FR', {
        hour: '2-digit',
        minute: '2-digit'
      }).format(regroupement.updatedAt)}</strong></p>
        <p>${regroupement.classes.length} classe(s) sélectionnée(s)</p>
      `;

      card.appendChild(header);
      card.appendChild(content);
      card.appendChild(footer);

      return card;
    }

    /**
     * Rend les statistiques RÉELLES (effectifs, parité)
     */
    renderStats() {
      if (!this.dom.statsContainer) {
        return;
      }

      const totalClasses = this.state.regroupements.reduce((acc, reg) => acc + reg.classes.length, 0);
      const uniqueClasses = new Set(this.state.regroupements.flatMap((reg) => reg.classes));
      const totalRegroupements = this.state.regroupements.length;

      // ✅ Calculer les effectifs RÉELS depuis window.STATE.classesData
      let totalStudents = 0;
      let totalGirls = 0;
      let totalBoys = 0;

      if (windowRef.STATE && windowRef.STATE.classesData) {
        this.state.regroupements.forEach((reg) => {
          reg.classes.forEach((className) => {
            const classData = windowRef.STATE.classesData[className];
            if (classData && classData.eleves) {
              classData.eleves.forEach((eleve) => {
                totalStudents++;
                if (eleve.sexe === 'F') totalGirls++;
                if (eleve.sexe === 'M') totalBoys++;
              });
            }
          });
        });
      }

      const parityPercent = totalStudents > 0 
        ? Math.round((Math.min(totalGirls, totalBoys) / totalStudents) * 100)
        : 0;

      this.dom.statsContainer.innerHTML = `
        <div class="stat-card">
          <span class="stat-card__label">Regroupements configurés</span>
          <span class="stat-card__value">${totalRegroupements}</span>
        </div>
        <div class="stat-card">
          <span class="stat-card__label">Classes impliquées</span>
          <span class="stat-card__value">${uniqueClasses.size}</span>
        </div>
        <div class="stat-card">
          <span class="stat-card__label">Élèves concernés</span>
          <span class="stat-card__value">${totalStudents}</span>
        </div>
        <div class="stat-card">
          <span class="stat-card__label">Parité F/M</span>
          <span class="stat-card__value">${totalGirls}F / ${totalBoys}M (${parityPercent}%)</span>
        </div>
      `;
    }

    /**
     * Rend la timeline
     */
    renderTimeline() {
      if (!this.dom.regroupementTimeline) {
        return;
      }

      const items = this.state.regroupements.map((reg, index) => {
        const label = `${index + 1}. ${reg.name}`;
        return `<li>${label} • ${reg.classes.length} classe(s) • ${reg.groupCount} groupe(s)</li>`;
      });

      this.dom.regroupementTimeline.innerHTML = items.join('');
    }

    /**
     * Rend le récapitulatif
     */
    renderSummary() {
      if (this.dom.summaryScenario) {
        const scenario = SCENARIOS[this.state.scenario];
        this.dom.summaryScenario.textContent = scenario ? `${scenario.title} – ${scenario.description}` : '';
      }

      if (this.dom.summaryMode) {
        const mode = MODES[this.state.distributionMode];
        this.dom.summaryMode.textContent = mode ? `${mode.label} – ${mode.description}` : '';
      }

      if (this.dom.summaryRegroupements) {
        const details = this.state.regroupements.map((reg) => `• ${reg.name} : ${reg.classes.length} classe(s), ${reg.groupCount} groupe(s)`).join('\n');
        this.dom.summaryRegroupements.textContent = details || 'Aucun regroupement configuré pour le moment.';
      }
    }

    /**
     * Ajoute une entrée au journal
     */
    appendLog(message) {
      if (!this.dom.generationLog) {
        return;
      }
      const entry = documentRef.createElement('div');
      entry.className = 'log-entry';
      entry.textContent = `${new Intl.DateTimeFormat('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }).format(new Date())} — ${message}`;
      this.dom.generationLog.prepend(entry);
    }

    /**
     * Bascule une classe pour un regroupement
     */
    toggleClassForRegroupement(regroupementId, classId, isChecked) {
      const regroupement = this.state.regroupements.find((reg) => reg.id === regroupementId);
      if (!regroupement) {
        return;
      }

      if (isChecked) {
        if (!regroupement.classes.includes(classId)) {
          regroupement.classes.push(classId);
        }
      } else {
        regroupement.classes = regroupement.classes.filter((cls) => cls !== classId);
      }
      regroupement.updatedAt = Date.now();
      this.appendLog(`📌 ${regroupement.name} → ${regroupement.classes.length} classe(s) sélectionnée(s).`);
      this.renderRegroupements();
      this.renderSummary();
    }

    /**
     * Valide les regroupements avant génération
     */
    validateRegroupements() {
      if (!this.state.regroupements.length) {
        return { valid: false, message: 'aucun regroupement configuré.' };
      }

      const incomplete = this.state.regroupements.find((reg) => reg.classes.length === 0);
      if (incomplete) {
        return { valid: false, message: `${incomplete.name} n'a aucune classe associée.` };
      }

      return { valid: true };
    }

    /**
     * ✅ BLOC 2 FIX : Affiche une interface verrouillée si données manquent
     * @param {string} message - Message à afficher
     */
    renderBlockedInterface(message) {
      if (!this.root) return;

      this.root.innerHTML = `
        <div style="
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
          padding: 40px;
          text-align: center;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        ">
          <div style="
            background: white;
            border-radius: 12px;
            padding: 40px;
            max-width: 600px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.1);
          ">
            <h2 style="
              color: #dc2626;
              margin: 0 0 15px 0;
              font-size: 24px;
            ">⚠️ Module verrouillé</h2>
            <pre style="
              background: #1f2937;
              color: #10b981;
              padding: 20px;
              border-radius: 8px;
              white-space: pre-wrap;
              word-wrap: break-word;
              font-size: 13px;
              line-height: 1.6;
              margin: 20px 0;
              text-align: left;
              overflow-x: auto;
            ">${this.escapeHtml(message)}</pre>
            <p style="
              color: #666;
              font-size: 14px;
              margin: 20px 0 0 0;
            ">Vérifiez la console navigateur (F12) pour plus de détails.</p>
          </div>
        </div>
      `;
    }

    /**
     * ✅ NOUVEAU : Crée la structure HTML initiale du triptyque 30/40/30
     * Remplace l'ancien système de phases par 3 colonnes permanentes
     */
    renderInitialStructure() {
      if (!this.root) return;

      // Injection du HTML triptyque complet (version compacte)
      this.root.innerHTML = `
        <style>
          /* Structure triptyque 30/40/30 - Version inline compacte */
          #groups-triptyque-container { display: flex; height: 100%; width: 100%; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
          .column-a { width: 30%; background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%); border-right: 1px solid #e2e8f0; display: flex; flex-direction: column; overflow-y: auto; }
          .column-b { width: 40%; background: #ffffff; border-right: 1px solid #e2e8f0; display: flex; flex-direction: column; overflow-y: auto; }
          .column-c { width: 30%; background: linear-gradient(180deg, #fafbfc 0%, #f9fafb 100%); display: flex; flex-direction: column; overflow-y: auto; }
          .section-header { background: white; padding: 20px; border-bottom: 2px solid #e2e8f0; position: sticky; top: 0; z-index: 10; }
          .section-title { font-size: 18px; font-weight: 700; color: #1e293b; margin-bottom: 8px; }
          .section-subtitle { font-size: 13px; color: #64748b; line-height: 1.5; }
          .scenario-btn { width: 100%; padding: 16px; margin-bottom: 12px; border: 2px solid #e2e8f0; border-radius: 12px; background: white; cursor: pointer; transition: all 0.2s; text-align: left; display: flex; align-items: center; gap: 12px; }
          .scenario-btn:hover { border-color: #6366f1; background: #f5f3ff; }
          .scenario-btn.is-active { border-color: #6366f1; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: white; }
          .regroupement-card { background: white; border: 2px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 12px; cursor: pointer; }
          .cta-banner { background: white; border-top: 2px solid #e2e8f0; padding: 16px 20px; position: sticky; bottom: 0; display: flex; gap: 12px; }
          .cta-btn { flex: 1; padding: 14px 20px; border: none; border-radius: 8px; font-size: 14px; font-weight: 700; cursor: pointer; transition: all 0.2s; }
          .cta-btn-primary { background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: white; }
        </style>

        <div id="groups-triptyque-container">
          <!-- COLONNE A : Scénarios et Contraintes (30%) -->
          <div class="column-a">
            <div class="section-header">
              <div class="section-title">Scénarios</div>
              <div class="section-subtitle">Choisissez le type de regroupement</div>
            </div>
            <div style="padding: 20px;">
              <button class="scenario-btn is-active" data-scenario="needs">
                <span style="font-size: 24px;">📊</span>
                <div>
                  <div style="font-size: 15px; font-weight: 700;">Besoins</div>
                  <div style="font-size: 12px; opacity: 0.85;">Équilibrer les profils</div>
                </div>
              </button>
              <button class="scenario-btn" data-scenario="lv2">
                <span style="font-size: 24px;">🗣️</span>
                <div>
                  <div style="font-size: 15px; font-weight: 700;">LV2</div>
                  <div style="font-size: 12px; opacity: 0.85;">Organiser par langue</div>
                </div>
              </button>
              <button class="scenario-btn" data-scenario="options">
                <span style="font-size: 24px;">⭐</span>
                <div>
                  <div style="font-size: 15px; font-weight: 700;">Options</div>
                  <div style="font-size: 12px; opacity: 0.85;">Grouper par enseignements</div>
                </div>
              </button>
            </div>
            <div data-scenario-helper style="padding: 0 20px 20px; font-size: 13px; color: #64748b;"></div>
            <div style="padding: 20px; background: white; margin: 0 20px 20px; border-radius: 12px; border: 1px solid #e2e8f0;">
              <div style="font-size: 14px; font-weight: 700; margin-bottom: 12px;">⚙️ Distribution</div>
              <div style="display: flex; gap: 8px;">
                <button class="mode-btn" data-mode="heterogeneous" style="flex: 1; padding: 12px; border: 2px solid #3b82f6; border-radius: 8px; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; cursor: pointer;">🔀 Hétérogène</button>
                <button class="mode-btn" data-mode="homogeneous" style="flex: 1; padding: 12px; border: 2px solid #e2e8f0; border-radius: 8px; background: white; cursor: pointer;">📊 Homogène</button>
              </div>
            </div>
            <div data-mode-helper style="padding: 0 20px 20px; font-size: 13px; color: #64748b;"></div>
          </div>

          <!-- COLONNE B : Regroupements (40%) -->
          <div class="column-b">
            <div class="section-header">
              <div class="section-title">Regroupements</div>
              <div class="section-subtitle">Gérez vos associations de classes</div>
            </div>
            <div style="padding: 20px; flex: 1; overflow-y: auto;" id="regroupements-columns">
              <!-- Cartes de regroupement générées dynamiquement -->
            </div>
            <div class="cta-banner">
              <button class="cta-btn cta-btn-primary" id="generate-regroupements">⚡ Générer</button>
              <button class="cta-btn" id="reset-regroupements" style="background: white; border: 2px solid #e2e8f0; color: #64748b;">🔄 Réinitialiser</button>
            </div>
          </div>

          <!-- COLONNE C : Aperçu et Statistiques (30%) -->
          <div class="column-c">
            <div class="section-header">
              <div class="section-title">Récapitulatif</div>
              <div class="section-subtitle">Vue d'ensemble</div>
            </div>
            <div style="padding: 20px; flex: 1; overflow-y: auto;">
              <div style="margin-bottom: 16px;">
                <div style="font-size: 13px; font-weight: 700; color: #64748b; margin-bottom: 8px;">Scénario</div>
                <div data-summary-scenario style="font-size: 14px; color: #1e293b;"></div>
              </div>
              <div style="margin-bottom: 16px;">
                <div style="font-size: 13px; font-weight: 700; color: #64748b; margin-bottom: 8px;">Mode</div>
                <div data-summary-mode style="font-size: 14px; color: #1e293b;"></div>
              </div>
              <div style="margin-bottom: 16px;">
                <div style="font-size: 13px; font-weight: 700; color: #64748b; margin-bottom: 8px;">Regroupements</div>
                <div data-summary-regroupements style="font-size: 14px; color: #1e293b;"></div>
              </div>
              <div id="regroupement-stats" style="background: white; padding: 16px; border-radius: 12px; border: 1px solid #e2e8f0; margin-bottom: 16px;"></div>
              <div id="regroupement-timeline" style="background: #f8fafc; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0;"></div>
              <div id="generation-log" style="margin-top: 16px; padding: 12px; background: #1e293b; color: #10b981; font-family: monospace; font-size: 11px; border-radius: 8px; max-height: 200px; overflow-y: auto;"></div>
            </div>
          </div>
        </div>

        <input type="number" id="regroupement-count" style="display: none;" />
        <button id="apply-regroupement-count" style="display: none;"></button>
        <button id="close-module" style="position: absolute; top: 16px; right: 16px; width: 32px; height: 32px; border-radius: 50%; background: white; border: 1px solid #e2e8f0; cursor: pointer; display: flex; align-items: center; justify-content: center;">✕</button>
      `;

      console.log('✅ Structure HTML triptyque 30/40/30 créée');
    }

    /**
     * ✅ BLOC 3 FIX : Écoute les résultats de génération du loader
     * et réinjecte les résultats dans l'interface
     */
    bindGenerationEvents() {
      if (!this.root) return;

      // Écouteur pour les résultats de génération réussie
      this.root.addEventListener('groups:generated', (event) => {
        const detail = event.detail;

        if (!detail || !detail.success) {
          console.error('❌ Génération échouée:', detail?.message);
          this.appendLog(`❌ Erreur: ${detail?.message || 'Génération échouée'}`);
          return;
        }

        // ✅ Réinjecter les résultats
        this.generationResults = detail.results;
        this.appendLog('✅ Génération réussie!');

        // Afficher détails regroupement par regroupement
        if (Array.isArray(detail.results)) {
          detail.results.forEach((result) => {
            const groupCount = result.groups?.length || 0;
            const studentsTotal = result.groups?.reduce((sum, g) => sum + (g.length || 0), 0) || 0;
            this.appendLog(`   📌 ${result.regroupement}: ${groupCount} groupe(s) • ${studentsTotal} élève(s)`);
          });

          // ✅ Afficher les statistiques globales de génération
          const totalGroups = detail.results.reduce((sum, r) => sum + (r.groups?.length || 0), 0);
          const totalStudents = detail.results.reduce((sum, r) =>
            sum + (r.groups?.reduce((s, g) => s + (g.length || 0), 0) || 0), 0);
          this.appendLog(`   📊 Total: ${totalGroups} groupes • ${totalStudents} élèves répartis`);

          // ✅ Stocker les résultats dans l'état pour affichage dans preview
          this.state.lastGenerationResults = detail.results;
          this.state.currentCarouselIndex = 0; // Réinitialiser au premier regroupement

          // ✅ Afficher la preview du premier regroupement
          this.renderGenerationPreview();
        }

        // Rafraîchir le résumé avec les stats
        this.renderSummary();
      });

      // Écouteur pour les erreurs de génération
      this.root.addEventListener('groups:error', (event) => {
        const detail = event.detail;
        console.error('❌ Erreur groups:error:', detail);
        this.appendLog(`❌ Erreur génération: ${detail?.message || 'Erreur inconnue'}`);
      });

      console.log('✅ Event listeners génération attachés au triptyque');
    }

    /**
     * ✅ NOUVEAU : Affiche la preview des groupes générés dans la colonne C
     */
    renderGenerationPreview() {
      if (!this.state.lastGenerationResults || !Array.isArray(this.state.lastGenerationResults)) {
        console.warn('⚠️ Aucun résultat de génération à afficher');
        return;
      }

      const currentIndex = this.state.currentCarouselIndex || 0;
      const currentResult = this.state.lastGenerationResults[currentIndex];

      if (!currentResult) {
        console.warn('⚠️ Résultat de génération introuvable à l\'index', currentIndex);
        return;
      }

      // Afficher le titre du regroupement actuel
      const carouselTitle = this.root.querySelector('#carousel-current-title');
      if (carouselTitle) {
        carouselTitle.textContent = currentResult.regroupement || `Regroupement ${currentIndex + 1}`;
      }

      // Afficher l'indicateur du carrousel
      const carouselIndicator = this.root.querySelector('#carousel-indicator');
      if (carouselIndicator) {
        carouselIndicator.textContent = `${currentIndex + 1}/${this.state.lastGenerationResults.length}`;
      }

      // Afficher les groupes dans la preview
      const groupsPreview = this.root.querySelector('#groups-preview');
      if (!groupsPreview) return;

      groupsPreview.innerHTML = '';

      if (!currentResult.groups || !Array.isArray(currentResult.groups)) {
        groupsPreview.innerHTML = '<p style="color: #64748b; padding: 20px; text-align: center;">Aucun groupe généré</p>';
        return;
      }

      currentResult.groups.forEach((group, groupIndex) => {
        const groupColumn = documentRef.createElement('div');
        groupColumn.className = 'group-column';
        groupColumn.style.cssText = 'background: white; border: 2px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-bottom: 12px;';

        const groupHeader = documentRef.createElement('div');
        groupHeader.style.cssText = 'font-size: 12px; font-weight: 700; color: #64748b; margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between;';
        groupHeader.innerHTML = `<span>Groupe ${groupIndex + 1}</span><span>${group.length || 0} élèves</span>`;
        groupColumn.appendChild(groupHeader);

        if (Array.isArray(group)) {
          group.forEach((student) => {
            const studentItem = documentRef.createElement('div');
            studentItem.style.cssText = 'padding: 8px; background: #f8fafc; border-radius: 6px; margin-bottom: 6px; font-size: 12px;';
            const nom = student.nom || '';
            const prenom = student.prenom || '';
            const sexe = student.sexe ? `(${student.sexe})` : '';
            studentItem.textContent = `${nom} ${prenom} ${sexe}`.trim();
            groupColumn.appendChild(studentItem);
          });
        }

        groupsPreview.appendChild(groupColumn);
      });

      // ✅ Afficher les statistiques du regroupement actuel
      this.renderGenerationStats(currentResult);

      console.log('✅ Preview de génération affichée pour', currentResult.regroupement);
    }

    /**
     * ✅ NOUVEAU : Affiche les statistiques des groupes générés
     */
    renderGenerationStats(result) {
      if (!result || !result.statistics) {
        console.warn('⚠️ Pas de statistiques disponibles');
        return;
      }

      const statsContainer = this.dom.statsContainer;
      if (!statsContainer) return;

      const stats = result.statistics;
      const totalGroups = stats.length;
      const totalStudents = stats.reduce((sum, s) => sum + (s.size || 0), 0);
      const avgSize = totalGroups > 0 ? Math.round(totalStudents / totalGroups) : 0;

      const totalFemales = stats.reduce((sum, s) => sum + (s.femaleCount || 0), 0);
      const totalMales = stats.reduce((sum, s) => sum + (s.maleCount || 0), 0);
      const parityPercent = totalStudents > 0
        ? Math.round((Math.min(totalFemales, totalMales) / totalStudents) * 200)
        : 0;

      statsContainer.innerHTML = `
        <div class="stat-card" style="padding: 12px; background: #f8fafc; border-radius: 8px; text-align: center; margin-bottom: 8px;">
          <div style="font-size: 11px; color: #64748b; margin-bottom: 4px;">Groupes générés</div>
          <div style="font-size: 20px; font-weight: 700; color: #1e293b;">${totalGroups}</div>
        </div>
        <div class="stat-card" style="padding: 12px; background: #f8fafc; border-radius: 8px; text-align: center; margin-bottom: 8px;">
          <div style="font-size: 11px; color: #64748b; margin-bottom: 4px;">Élèves répartis</div>
          <div style="font-size: 20px; font-weight: 700; color: #1e293b;">${totalStudents}</div>
        </div>
        <div class="stat-card" style="padding: 12px; background: #f8fafc; border-radius: 8px; text-align: center; margin-bottom: 8px;">
          <div style="font-size: 11px; color: #64748b; margin-bottom: 4px;">Taille moyenne</div>
          <div style="font-size: 20px; font-weight: 700; color: #1e293b;">${avgSize}</div>
        </div>
        <div class="stat-card" style="padding: 12px; background: #f8fafc; border-radius: 8px; text-align: center; margin-bottom: 8px;">
          <div style="font-size: 11px; color: #64748b; margin-bottom: 4px;">Parité F/M</div>
          <div style="font-size: 20px; font-weight: 700; color: #1e293b;">${totalFemales}F / ${totalMales}M</div>
          <div style="font-size: 10px; color: #10b981; margin-top: 4px;">${parityPercent}% équilibré</div>
        </div>
      `;
    }

    /**
     * Échappe le HTML pour l'affichage en <pre>
     */
    escapeHtml(text) {
      const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
      };
      return (text || '').replace(/[&<>"']/g, m => map[m]);
    }
  }

  // Exposer globalement
  windowRef.TriptychGroupsModule = TriptychGroupsModule;

  // ✅ FIX 2 : SUPPRIMER la duplication du gestionnaire groups:generate
  // Le gestionnaire est géré par InterfaceV2_GroupsModuleV4_Script.js (loader)
  // Ce fichier ne gère QUE l'interface triptyque, pas la logique de génération

  // Auto-initialisation si l'élément existe
  if (documentRef.readyState === 'loading') {
    documentRef.addEventListener('DOMContentLoaded', () => {
      const root = documentRef.querySelector('#groups-module-v4');
      if (root && !windowRef.__triptychModuleInstance) {
        windowRef.__triptychModuleInstance = new TriptychGroupsModule(root);
        console.log('✅ TriptychGroupsModule auto-initialisé (DOMContentLoaded)');
      }
    });
  } else {
    const root = documentRef.querySelector('#groups-module-v4');
    if (root && !windowRef.__triptychModuleInstance) {
      windowRef.__triptychModuleInstance = new TriptychGroupsModule(root);
      console.log('✅ TriptychGroupsModule auto-initialisé (readyState !== loading)');
    }
  }

  console.log('✅ InterfaceV4_Triptyque_Logic.js chargé');

})(); // Fin IIFE
    