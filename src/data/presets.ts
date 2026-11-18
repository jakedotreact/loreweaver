import { StoryProject } from '../types/story';

export interface UniverseTemplate {
  id: string;
  title: string;
  universe: string;
  setting: string;
  tone: string;
  premise: string;
  coverImage: string;
  summary: string;
  starterProject: StoryProject;
}

export const UNIVERSE_TEMPLATES: UniverseTemplate[] = [
  {
    id: 'hogwarts-fifth-year',
    title: 'The Umbridge Ledger',
    universe: 'Harry Potter (Wizarding World)',
    setting: 'Hogwarts School of Witchcraft and Wizardry · Autumn 1995',
    tone: 'Character-Driven Mystery & Political Tension',
    premise:
      'In the wake of Cedric Diggory’s death and the Ministry’s denial of Voldemort’s return, Harry Potter notices an unlisted ledger locked inside the Room of Requirement—listing students whose wand cores match spells cast outside school grounds under suspicious Ministry warrants.',
    coverImage: '/src/assets/images/cover_wizarding_academy_1794799109983.jpg',
    summary:
      'Canon-faithful Wizarding World branch featuring Harry Potter, Hermione Granger, Severus Snape, and Dolores Umbridge with active magical law constraints.',
    starterProject: {
      id: 'proj-hogwarts-1995',
      title: 'The Umbridge Ledger',
      universe: 'Harry Potter (Wizarding World)',
      setting: 'Hogwarts School of Witchcraft and Wizardry · Autumn 1995',
      tone: 'Character-Driven Mystery & Political Tension',
      premise:
        'In the wake of Cedric Diggory’s death and the Ministry’s denial of Voldemort’s return, Harry Potter notices an unlisted ledger locked inside the Room of Requirement—listing students whose wand cores match spells cast outside school grounds under suspicious Ministry warrants.',
      coverImage: '/src/assets/images/cover_wizarding_academy_1794799109983.jpg',
      protagonistId: 'char-harry',
      isPrivate: false,
      tags: {
        rating: 'Teen And Up Audiences',
        warnings: ['No Archive Warnings Apply'],
        categories: ['Gen'],
        fandoms: ['Harry Potter (Wizarding World)'],
        relationships: ['Harry Potter & Hermione Granger', 'Harry Potter & Severus Snape'],
        characters: ['Harry Potter', 'Hermione Granger', 'Severus Snape', 'Dolores Umbridge'],
        freeforms: [
          'Alternate Universe - Canon Divergence',
          'Fifth Year at Hogwarts',
          'Mystery & Investigation',
          'Ministry Intrigue',
          'Found Family',
        ],
      },
      updatedAt: Date.now(),
      characters: [
        {
          id: 'char-harry',
          name: 'Harry Potter',
          role: 'Protagonist',
          origin: 'canon',
          summary:
            'Fifth-year Gryffindor Seeker grappling with isolation, recurring visions through his scar, and mounting pressure from the Ministry of Magic.',
          pros: [
            'Instinctive courage under lethal pressure',
            'Natural aptitude for Defense Against the Dark Arts',
            'Fierce loyalty to friends in danger',
          ],
          flaws: [
            'Impulsive decision-making when loved ones feel threatened',
            'Volatile temper and stubborn refusal to ask authority for help',
            'Susceptible to Occlumency breaches and emotional tunnel vision',
          ],
          motivation:
            'Expose the Ministry’s cover-up while keeping his classmates safe from Umbridge’s decrees.',
          voiceAndMannerisms:
            'Direct, wry under stress, tends to clench his jaw and act before weighing political fallout.',
          status: 'Healthy · Detention scar on right hand',
          location: 'Seventh-Floor Corridor (outside the tapestry of Barnabas the Barmy)',
          inventory: [
            'Holly and phoenix-feather wand (11 inches)',
            'Marauder’s Map (folded in cloak pocket)',
            'Invisibility Cloak',
          ],
          relationships: [
            { targetName: 'Hermione Granger', relation: 'Trusted confidante and strategic counterweight' },
            { targetName: 'Severus Snape', relation: 'Mutual distrust and bitter antagonism' },
            { targetName: 'Dolores Umbridge', relation: 'Open ideological adversary' },
          ],
          deducedFromContext: true,
        },
        {
          id: 'char-hermione',
          name: 'Hermione Granger',
          role: 'Companion',
          origin: 'canon',
          summary:
            'Fifth-year Gryffindor Prefect with encyclopedic knowledge of magical law, Hogwarts history, and protective charms.',
          pros: [
            'Rigorous analytical reasoning and recall of obscure Ministry statutes',
            'Precise spellwork and long-term contingency planning',
            'Moral clarity when confronting institutional injustice',
          ],
          flaws: [
            'Over-reliance on official rules until pushed past her breaking point',
            'Anxiety under uncertainty that can turn into sharp impatience',
            'Tendency to take on unsustainable responsibility alone',
          ],
          motivation:
            'Organize defensive training for students while preventing Harry from walking into Ministry traps.',
          voiceAndMannerisms:
            'Rapid, articulate, cites exact precedents, instinctively checks exits and curfew times.',
          status: 'Alert · Carrying enchanted Protean Galleons',
          location: 'Seventh-Floor Corridor',
          inventory: [
            'Vine wood wand with dragon heartstring core',
            'Beaded satchel of reference texts',
            'Enchanted Galleon coin',
          ],
          relationships: [
            { targetName: 'Harry Potter', relation: 'Fiercely protective ally' },
            { targetName: 'Dolores Umbridge', relation: 'Contempt masked by meticulous compliance' },
          ],
          deducedFromContext: true,
        },
        {
          id: 'char-snape',
          name: 'Severus Snape',
          role: 'NPC',
          origin: 'canon',
          summary:
            'Potions Master and Head of Slytherin House walking a razor-thin double-agent line between Dumbledore and Voldemort.',
          pros: [
            'Master-level Legilimency, Occlumency, and potioncraft',
            'Ice-cold composure under interrogation',
            'Unmatched tactical awareness of Death Eater networks',
          ],
          flaws: [
            'Deep-seated bitterness toward James Potter’s memory coloring his view of Harry',
            'Abrasive, mocking demeanor that alienates potential allies',
            'Secretive to the point of withholding vital context',
          ],
          motivation:
            'Maintain his cover with the Ministry and Death Eaters while quietly neutralizing threats to Hogwarts.',
          voiceAndMannerisms:
            'Soft, measured, razor-edged cadence; never raises his voice when furious.',
          status: 'Composure intact · Monitoring corridor traffic',
          location: 'Dungeons (Potions Office)',
          inventory: ['Ebony wand', 'Silver vial of Veritaserum antidote', 'Slytherin House ledger'],
          relationships: [
            { targetName: 'Harry Potter', relation: 'Resentful mentor-antagonist dynamic' },
            { targetName: 'Dolores Umbridge', relation: 'Coldly professional disdain' },
          ],
          deducedFromContext: true,
        },
        {
          id: 'char-umbridge',
          name: 'Dolores Umbridge',
          role: 'Antagonist',
          origin: 'canon',
          summary:
            'Senior Undersecretary to the Minister for Magic and newly appointed High Inquisitor of Hogwarts.',
          pros: [
            'Absolute command of Ministry bureaucracy and Educational Decrees',
            'Ruthless political opportunism and institutional backing',
            'Skilled at extracting compliance through subtle intimidation',
          ],
          flaws: [
            'Extreme hubris and blindness to magic outside Ministry orthodoxy',
            'Cruelty disguised beneath saccharine politeness',
            'Underestimates student solidarity and Hogwarts’ own protections',
          ],
          motivation:
            'Suppress dissent at Hogwarts, discredit Dumbledore, and centralize Ministry control.',
          voiceAndMannerisms:
            'Sweet, breathy "Hem, hem" cough; weaponized etiquette paired with rigid posture.',
          status: 'Active · Enforcing Educational Decree No. 24',
          location: 'Defense Against the Dark Arts Office',
          inventory: ['Short birch wand', 'Black Quill (Blood Quill)', 'Ministry Seal of Authority'],
          relationships: [
            { targetName: 'Harry Potter', relation: 'Primary target for public discrediting' },
          ],
          deducedFromContext: true,
        },
      ],
      crossIndex: [
        {
          id: 'ci-hp-1',
          category: 'world_rule',
          title: 'Anti-Apparition Wards Inside Hogwarts',
          detail:
            'No witch or wizard (save house-elves) may Apparate or Disapparate anywhere within Hogwarts Castle or its grounds.',
          tags: ['magic', 'hogwarts', 'constraint'],
          status: 'active',
          introducedAtTurn: 1,
          lastVerifiedTurn: 1,
          pinned: true,
        },
        {
          id: 'ci-hp-2',
          category: 'world_rule',
          title: 'Educational Decree Number Twenty-Four',
          detail:
            'All student organizations, societies, teams, groups, and clubs are disbanded unless expressly approved by the High Inquisitor.',
          tags: ['ministry', 'law', 'umbridge'],
          status: 'active',
          introducedAtTurn: 1,
          lastVerifiedTurn: 1,
          pinned: true,
        },
        {
          id: 'ci-hp-3',
          category: 'location',
          title: 'The Room of Requirement (Seventh Floor)',
          detail:
            'Hidden opposite the tapestry of Barnabas the Barmy; only manifests when paced past three times with genuine need, and cannot be found on the Marauder’s Map.',
          tags: ['hogwarts', 'secret', 'map'],
          status: 'active',
          introducedAtTurn: 1,
          lastVerifiedTurn: 1,
          pinned: true,
        },
        {
          id: 'ci-hp-4',
          category: 'item',
          title: 'Marauder’s Map',
          detail:
            'Held by Harry Potter. Reveals every person inside Hogwarts grounds by name and movement, except spaces unplottable like the Room of Requirement.',
          tags: ['harry', 'artifact', 'surveillance'],
          status: 'active',
          introducedAtTurn: 1,
          lastVerifiedTurn: 1,
          pinned: false,
        },
        {
          id: 'ci-hp-5',
          category: 'plot_thread',
          title: 'The Unlisted Wand-Core Ledger',
          detail:
            'A Ministry-stamped parchment ledger bearing Filch’s ink smudge and twelve student wand-core signatures—discovered inside a locked desk inside the Room of Requirement.',
          tags: ['mystery', 'ledger', 'ministry'],
          status: 'active',
          introducedAtTurn: 1,
          lastVerifiedTurn: 1,
          pinned: true,
        },
        {
          id: 'ci-hp-6',
          category: 'timeline',
          title: 'Turn 01 · Evening After Curfew Approach',
          detail:
            'October 1995, 8:40 PM. Harry and Hermione reach the seventh-floor corridor twenty minutes before curfew while Umbridge’s Inquisitorial patrols form below.',
          tags: ['chronology', 'curfew'],
          status: 'active',
          introducedAtTurn: 1,
          lastVerifiedTurn: 1,
          pinned: false,
        },
      ],
      turns: [
        {
          id: 'turn-hp-1',
          turnNumber: 1,
          sceneTitle: 'The Ledger Behind the Tapestry',
          location: 'Seventh-Floor Corridor, Hogwarts',
          inStoryTime: 'October 1995 · 20 Minutes Before Curfew',
          userAction: null,
          prose: [
            'The seventh-floor corridor smelled of damp stone and extinguished tallow. Across from the tapestry of Barnabas the Barmy, the heavy oak door of the Room of Requirement had already melted shut behind them—yet Harry still held the cold brass-clasped ledger he had pulled from its crooked mahogany desk.',
            'Hermione kept her wand lit at a cautious half-lumos, shielding the tip with her free hand. On the Marauder’s Map spread across the windowsill, two dots marked Argus Filch and Mrs. Norris were climbing the grand staircase two floors below, while Severus Snape’s ink-name remained motionless down in the dungeons.',
            '“It isn’t one of Dumbledore’s lists,” Hermione whispered, tapping the Ministry wax seal pressed into the ledger’s spine. “Look at the dates, Harry. Every single wand-core record here was logged after the Wizengamot hearing—and half of these names belong to Muggle-born third-years who don’t even own owls.”',
          ],
          choices: [
            {
              id: 'c-hp-1',
              label: 'Inspect the Marauder’s Map for who entered the seventh floor earlier',
              intent: 'Gather intelligence without alerting anyone',
              consequenceHint: 'Reveals corridor traffic before Filch arrives, costing precious minutes before curfew.',
            },
            {
              id: 'c-hp-2',
              label: 'Cast Revelio on the ledger’s sealed Ministry margin',
              intent: 'Uncover hidden enchantments or authorship',
              consequenceHint: 'May expose a Dark or Ministry tracking charm—risking detection if traced.',
            },
            {
              id: 'c-hp-3',
              label: 'Head down toward the dungeons to confront Snape directly',
              intent: 'Test whether Snape knows about the Ministry warrants',
              consequenceHint: 'High social and disciplinary risk; Snape’s reaction will reshape his trust.',
            },
            {
              id: 'c-hp-4',
              label: 'Slip under the Invisibility Cloak and hide the ledger in Gryffindor Tower',
              intent: 'Secure the evidence before curfew patrols sweep the hall',
              consequenceHint: 'Buys time to study the names safely, though the trail in the corridor goes cold.',
            },
          ],
          selectedChoiceId: null,
          activeCharacters: ['Harry Potter', 'Hermione Granger'],
          continuityNotes: [
            'Verified: Room of Requirement remains absent from Marauder’s Map layout.',
            'Verified: Harry holds the Marauder’s Map and Invisibility Cloak in inventory.',
            'Verified: Educational Decree No. 24 forbids unauthorized student assemblies.',
          ],
          continuityWarning: null,
          timestamp: Date.now(),
        },
      ],
      savePoints: [],
    },
  },
  {
    id: 'arrakeen-salt-throne',
    title: 'Shadows of the Salt Throne',
    universe: 'Dune (Arrakis)',
    setting: 'Arrakeen Citadel · Early Atreides Administration',
    tone: 'High-Stakes Political Intrigue & Ecological Survival',
    premise:
      'Weeks after House Atreides assumes stewardship of Arrakis, a water-shipper’s corpse is discovered inside the conservatory cistern with a Harkonnen cipher ring—and an authentic Fremen crysknife sheath missing its blade.',
    coverImage: '/src/assets/images/cover_desert_citadel_1794799110791.jpg',
    summary:
      'Canon Dune universe enforcing Bene Gesserit discipline, Mentat logic, water scarcity laws, and shield-desert constraints.',
    starterProject: {
      id: 'proj-dune-arrakeen',
      title: 'Shadows of the Salt Throne',
      universe: 'Dune (Arrakis)',
      setting: 'Arrakeen Citadel · Early Atreides Administration',
      tone: 'High-Stakes Political Intrigue & Ecological Survival',
      premise:
        'Weeks after House Atreides assumes stewardship of Arrakis, a water-shipper’s corpse is discovered inside the conservatory cistern with a Harkonnen cipher ring—and an authentic Fremen crysknife sheath missing its blade.',
      coverImage: '/src/assets/images/cover_desert_citadel_1794799110791.jpg',
      protagonistId: 'char-paul',
      isPrivate: false,
      tags: {
        rating: 'Teen And Up Audiences',
        warnings: ['Graphic Depictions Of Violence'],
        categories: ['Gen'],
        fandoms: ['Dune (Arrakis)'],
        relationships: ['Paul Atreides & Lady Jessica', 'Lady Jessica & Thufir Hawat'],
        characters: ['Paul Atreides', 'Lady Jessica', 'Thufir Hawat'],
        freeforms: [
          'Political Intrigue',
          'Ecological Worldbuilding',
          'Espionage',
          'Bene Gesserit Lore',
          'Case Fic',
        ],
      },
      updatedAt: Date.now(),
      characters: [
        {
          id: 'char-paul',
          name: 'Paul Atreides',
          role: 'Protagonist',
          origin: 'canon',
          summary:
            'Heir of House Atreides trained in Bene Gesserit Prana-Bindu control, Mentat computation, and swordmaster combat.',
          pros: [
            'Acute observational Mentat training and hyper-awareness',
            'Bene Gesserit Voice discipline and nerve control',
            'Natural leadership intuition respected by Fremen and Atreides guards',
          ],
          flaws: [
            'Burdened by fragmented prescient visions that resist certainty',
            'Youthful urgency to prove himself worthy of Duke Leto’s trust',
            'Reluctance to embrace ruthless sacrifice before necessity forces it',
          ],
          motivation:
            'Uncover the Harkonnen saboteur inside Arrakeen before the water supply is poisoned or weaponized.',
          voiceAndMannerisms:
            'Measured, attentive to micro-expressions, pauses before speaking to weigh unspoken motives.',
          status: 'Alert · Wearing stillsuit beneath Atreides tunic',
          location: 'Arrakeen Residency Conservatory',
          inventory: ['Atreides signet ring', 'Hunter-seeker detector wand', 'Crysknife sheath (empty)'],
          relationships: [
            { targetName: 'Lady Jessica', relation: 'Mother and Bene Gesserit mentor' },
            { targetName: 'Thufir Hawat', relation: 'Master of Assassins and tactical tutor' },
          ],
          deducedFromContext: true,
        },
        {
          id: 'char-jessica',
          name: 'Lady Jessica',
          role: 'Companion',
          origin: 'canon',
          summary:
            'Bene Gesserit concubine to Duke Leto and fiercely strategic protector of House Atreides.',
          pros: [
            'Mastery of the Voice and micro-expression reading (Truthsayer training)',
            'Unflinching composure in lethal political traps',
            'Deep awareness of Missionaria Protectiva cultural levers',
          ],
          flaws: [
            'Deep suspicion of Mentat blind spots creates friction with Hawat',
            'Protective loyalty toward Paul and Leto occasionally overrides Bene Gesserit orders',
          ],
          motivation:
            'Isolate the traitor within the Residency without triggering open panic among the household guard.',
          voiceAndMannerisms:
            'Quiet authority, deliberate stillness, watchful gaze tracking breathing cadence.',
          status: 'Active · Inspecting conservatory seals',
          location: 'Arrakeen Residency Conservatory',
          inventory: ['Concealed Bene Gesserit poison snooper', 'Encrypted household cipher'],
          relationships: [
            { targetName: 'Paul Atreides', relation: 'Son and heir she trained against Sisterhood custom' },
            { targetName: 'Thufir Hawat', relation: 'Wary mutual respect clouded by suspicion' },
          ],
          deducedFromContext: true,
        },
        {
          id: 'char-hawat',
          name: 'Thufir Hawat',
          role: 'NPC',
          origin: 'canon',
          summary:
            'Aged Mentat and Master of Assassins serving House Atreides for three generations.',
          pros: [
            'Human computer capable of synthesizing vast espionage data',
            'Ruthless counter-espionage instincts',
          ],
          flaws: [
            'Paranoia toward Bene Gesserit motives blinds him to subtler traps',
            'Aging stamina strained by Arrakis’s harsh security environment',
          ],
          motivation:
            'Prove Atreides security remains unbroken and neutralize Harkonnen sleeper agents.',
          voiceAndMannerisms:
            'Sapho-stained lips, gravelly precision, frames every clue as probability vectors.',
          status: 'Suspicious · Reviewing guard rotations',
          location: 'Arrakeen Security Wing',
          inventory: ['Paracompass', 'Sapho vial', 'Encrypted guard roster'],
          relationships: [
            { targetName: 'Lady Jessica', relation: 'Suspects her of concealed allegiances' },
          ],
          deducedFromContext: true,
        },
      ],
      crossIndex: [
        {
          id: 'ci-dune-1',
          category: 'world_rule',
          title: 'Holtzman Shields & Desert Worms',
          detail:
            'Active Holtzman shields attract sandworms into a killing frenzy in the open desert and trigger catastrophic subatomic explosions if struck by a lasgun.',
          tags: ['shields', 'lasgun', 'arrakis'],
          status: 'active',
          introducedAtTurn: 1,
          lastVerifiedTurn: 1,
          pinned: true,
        },
        {
          id: 'ci-dune-2',
          category: 'world_rule',
          title: 'Fremen Crysknife Law',
          detail:
            'An unfixed crysknife must never be sheathed without drawing blood, and no outsider may carry one without Fremen sanction.',
          tags: ['fremen', 'custom', 'crysknife'],
          status: 'active',
          introducedAtTurn: 1,
          lastVerifiedTurn: 1,
          pinned: true,
        },
        {
          id: 'ci-dune-3',
          category: 'location',
          title: 'Arrakeen Residency Conservatory',
          detail:
            'A sealed, humid palm garden maintained at staggering water expense—guarded by double pressure-locks and acoustic baffles.',
          tags: ['arrakeen', 'water', 'location'],
          status: 'active',
          introducedAtTurn: 1,
          lastVerifiedTurn: 1,
          pinned: true,
        },
        {
          id: 'ci-dune-4',
          category: 'plot_thread',
          title: 'The Missing Crysknife & Cipher Ring',
          detail:
            'A water-shipper’s body lies beside the drainage grate wearing a Harkonnen signet cipher; the Fremen sheath beside him is empty.',
          tags: ['murder', 'sabotage', 'evidence'],
          status: 'active',
          introducedAtTurn: 1,
          lastVerifiedTurn: 1,
          pinned: true,
        },
      ],
      turns: [
        {
          id: 'turn-dune-1',
          turnNumber: 1,
          sceneTitle: 'Moisture on the Conservatory Stone',
          location: 'Arrakeen Residency Conservatory',
          inStoryTime: 'First Moon · Dawn Watch',
          userAction: null,
          prose: [
            'Humid air hung heavy beneath the conservatory’s armored glass, a decadent extravagance on a planet where a single spilled liter meant treason. Near the drainage grate, the water-shipper’s stillsuit had been slit clean along the catchpocket—yet whoever killed him had left his water untouched.',
            'Paul crouched beside the flagstones, his eyes tracking the faint chalk dust smeared along the marble lip. Beside the man’s stiff fingers lay a scarred leather sheath that smelled faintly of sand-tanned spice leather. Empty. Across his left knuckle glinted an iron ring bearing a blurred Harkonnen griffin.',
            'Lady Jessica stood motionless near the date palms, her hand hovering above the poison snooper at her belt. “Notice the spacing of the footsteps, Paul,” she said softly, her voice pitched beneath the trickle of the cistern fountain. “No shields were active here. Whoever took the blade knew the customs of the deep desert—or wanted us to think they did.”',
          ],
          choices: [
            {
              id: 'c-dune-1',
              label: 'Question the conservatory’s Fremen water-maid Shadout Mapes',
              intent: 'Verify the authenticity of the crysknife sheath',
              consequenceHint: 'Respects Fremen custom and may reveal who enters the palm room.',
            },
            {
              id: 'c-dune-2',
              label: 'Summon Thufir Hawat to cross-check the cipher ring against Harkonnen cells',
              intent: 'Bring Mentat counter-intelligence into the conservatory',
              consequenceHint: 'Sharpens tactical analysis, though Hawat’s distrust of Jessica may escalate.',
            },
            {
              id: 'c-dune-3',
              label: 'Trace the drainage sluice beneath the cistern before guards seal it',
              intent: 'Follow the killer’s physical exit route immediately',
              consequenceHint: 'Risks ambush in cramped tunnels where shields cannot be trusted.',
            },
          ],
          selectedChoiceId: null,
          activeCharacters: ['Paul Atreides', 'Lady Jessica'],
          continuityNotes: [
            'Verified: Unshielded strike consistent with indoor stealth and desert conditioning.',
            'Verified: Crysknife sheath empty—respects Fremen sacred blade customs.',
          ],
          continuityWarning: null,
          timestamp: Date.now(),
        },
      ],
      savePoints: [],
    },
  },
  {
    id: 'port-meridian-noir',
    title: 'The Brass Astrolabe',
    universe: 'Original · Clockwork Maritime Noir',
    setting: 'Port Meridian · Fog Season, 1889',
    tone: 'Atmospheric Detective Mystery',
    premise:
      'When the Chief Astronomer vanishes from Meridian’s locked lighthouse observatory during a tidal eclipse, Inspector Clara Vance inherits a ledger written in navigational cipher—and a brass astrolabe whose gears tick backward whenever someone in the room lies.',
    coverImage: '/src/assets/images/cover_clockwork_harbor_1794799110775.jpg',
    summary:
      'Original mystery universe showcasing custom character sheets, emergent NPC deduction, and strict physical-clue continuity.',
    starterProject: {
      id: 'proj-meridian-1889',
      title: 'The Brass Astrolabe',
      universe: 'Original · Clockwork Maritime Noir',
      setting: 'Port Meridian · Fog Season, 1889',
      tone: 'Atmospheric Detective Mystery',
      premise:
        'When the Chief Astronomer vanishes from Meridian’s locked lighthouse observatory during a tidal eclipse, Inspector Clara Vance inherits a ledger written in navigational cipher—and a brass astrolabe whose gears tick backward whenever someone in the room lies.',
      coverImage: '/src/assets/images/cover_clockwork_harbor_1794799110775.jpg',
      protagonistId: 'char-clara',
      isPrivate: false,
      tags: {
        rating: 'Teen And Up Audiences',
        warnings: ['No Archive Warnings Apply'],
        categories: ['Gen', 'F/M'],
        fandoms: ['Original Work', 'Clockwork Maritime Noir'],
        relationships: ['Inspector Clara Vance & Harbormaster Gideon Rook'],
        characters: ['Inspector Clara Vance', 'Harbormaster Gideon Rook'],
        freeforms: [
          'Locked Room Mystery',
          'Victorian Maritime Noir',
          'Clockwork Artifacts',
          'Detective Investigation',
          'Gaslamp Fantasy',
        ],
      },
      updatedAt: Date.now(),
      characters: [
        {
          id: 'char-clara',
          name: 'Inspector Clara Vance',
          role: 'Protagonist',
          origin: 'original',
          summary:
            'Harbor Constabulary investigator renowned for forensic rigor and a quiet obsession with maritime smuggling syndicates.',
          pros: [
            'Sharp forensic memory for tide tables, ship manifests, and mechanical clocks',
            'Calm under physical intimidation',
          ],
          flaws: [
            'Chronic insomnia that dulls patience with bureaucratic superiors',
            'Refuses to delegate critical evidence, carrying too much alone',
          ],
          motivation: 'Find Chief Astronomer Henrik Solberg alive and expose who rigged the lighthouse beacon.',
          voiceAndMannerisms:
            'Crisp, observant, checks her pocket chronometer before asking pointed questions.',
          status: 'Active · Rain-soaked greatcoat',
          location: 'Outer Breakwater Pier, Port Meridian',
          inventory: ['Brass astrolabe (anomalous)', 'Harbor Constabulary warrant', 'Oil lantern'],
          relationships: [
            { targetName: 'Harbormaster Gideon Rook', relation: 'Reluctant professional superior' },
          ],
          deducedFromContext: false,
        },
        {
          id: 'char-rook',
          name: 'Harbormaster Gideon Rook',
          role: 'NPC',
          origin: 'original',
          summary:
            'Veteran port administrator who controls every drydock ledger and quarantine signal in Meridian.',
          pros: [
            'Knows every captain, smuggler, and dockworker by voice',
            'Commanding presence during harbor emergencies',
          ],
          flaws: [
            'Deeply indebted to the Meridian Shipping Guild',
            'Prioritizes harbor commerce over truth when scandal looms',
          ],
          motivation: 'Keep the shipping lanes open before dawn regardless of who disappears.',
          voiceAndMannerisms: 'Gravelly baritone, taps pipe ash against iron bollards.',
          status: 'Guarded · Waiting near the customs shed',
          location: 'Outer Breakwater Pier',
          inventory: ['Customs master key', 'Brass pipe'],
          relationships: [
            { targetName: 'Inspector Clara Vance', relation: 'Pressuring her to rule it an accidental drowning' },
          ],
          deducedFromContext: false,
        },
      ],
      crossIndex: [
        {
          id: 'ci-pm-1',
          category: 'world_rule',
          title: 'The Anomalous Astrolabe Mechanic',
          detail:
            'The brass astrolabe ticks steadily clockwise in silence, but reverses its inner escapement wheel for three seconds whenever a deliberate falsehood is spoken within arm’s reach.',
          tags: ['artifact', 'mechanics', 'truth'],
          status: 'active',
          introducedAtTurn: 1,
          lastVerifiedTurn: 1,
          pinned: true,
        },
        {
          id: 'ci-pm-2',
          category: 'location',
          title: 'Meridian Lighthouse Observatory',
          detail:
            'Accessible only by the narrow tidal causeway during low water; its brass spiral door was bolted from the inside when the disappearance occurred.',
          tags: ['locked-room', 'observatory', 'tides'],
          status: 'active',
          introducedAtTurn: 1,
          lastVerifiedTurn: 1,
          pinned: true,
        },
        {
          id: 'ci-pm-3',
          category: 'timeline',
          title: 'Turn 01 · Low Tide at 11:15 PM',
          detail:
            'The tidal causeway to the lighthouse remains passable for only 45 more minutes before the midnight flood seals it until dawn.',
          tags: ['tide', 'deadline'],
          status: 'active',
          introducedAtTurn: 1,
          lastVerifiedTurn: 1,
          pinned: true,
        },
      ],
      turns: [
        {
          id: 'turn-pm-1',
          turnNumber: 1,
          sceneTitle: 'The Backward Escapement',
          location: 'Outer Breakwater Pier, Port Meridian',
          inStoryTime: '11:15 PM · Falling Fog & Rising Tide',
          userAction: null,
          prose: [
            'Gaslamps smeared yellow halos across the wet granite quay while the harbor foghorn groaned twice from the channel. Harbormaster Gideon Rook stood beside the customs shed, collar turned up against the salt drizzle, watching the black silhouette of the lighthouse across the tidal causeway.',
            '“The causeway floods in forty-five minutes, Vance,” Rook said, knocking cold ash from his briar pipe. “Solberg slipped on the wet parapet. Put it down as misadventure and let the morning brigantines clear the bar.”',
            'Inside Clara’s coat pocket, the brass astrolabe gave a sharp metallic click—and for three slow heartbeats, its tiny escapement wheel spun backward against her palm.',
          ],
          choices: [
            {
              id: 'c-pm-1',
              label: 'Cross the causeway to the lighthouse observatory before the tide seals it',
              intent: 'Inspect the locked room firsthand',
              consequenceHint: 'Gives 45 minutes inside the tower before being marooned until dawn.',
            },
            {
              id: 'c-pm-2',
              label: 'Confront Rook calmly about why he lied about Solberg’s accident',
              intent: 'Press Rook while keeping the astrolabe hidden',
              consequenceHint: 'May rattle Rook into revealing Guild pressure, or make him shut down access.',
            },
            {
              id: 'c-pm-3',
              label: 'Inspect the manifest log aboard the schooner Nighthawk moored nearby',
              intent: 'Check tonight’s cargo departures quietly',
              consequenceHint: 'Uncovers smuggling ties, though valuable tidal minutes slip away.',
            },
          ],
          selectedChoiceId: null,
          activeCharacters: ['Inspector Clara Vance', 'Harbormaster Gideon Rook'],
          continuityNotes: [
            'Verified: Astrolabe reversed for 3 seconds when Rook claimed Solberg slipped.',
            'Verified: 45-minute tidal window active before causeway submerges.',
          ],
          continuityWarning: null,
          timestamp: Date.now(),
        },
      ],
      savePoints: [],
    },
  },
];
