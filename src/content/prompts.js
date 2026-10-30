// Starter prompt pack.
//
// Each prompt lists accepted answers by tier: 1 = Common … 4 = Deep cut.
// Entries are separated by ";" and aliases by "|" (the first name is the one
// shown at the reveal). Case, accents, punctuation, spacing and a trailing
// plural "s" are ignored when matching, so only list genuinely different
// spellings as aliases. `npm test` fails if two entries in one prompt collide.

export const PROMPTS = [
  {
    id: 'pasta',
    text: 'Name a pasta shape',
    tiers: {
      1: 'spaghetti; penne; macaroni|mac; lasagna|lasagne; fettuccine|fettucine|fettucini; ravioli',
      2: 'linguine|linguini; rigatoni; fusilli|rotini; farfalle|bow tie|bowtie; tortellini; gnocchi; tagliatelle; angel hair|capellini; ziti; orzo; conchiglie|shells|pasta shells; cannelloni',
      3: 'orecchiette; pappardelle; ditalini; bucatini; cavatappi; manicotti; vermicelli; tortelloni; radiatori; rotelle|wagon wheels; campanelle; spaghettini; mezze maniche',
      4: 'trofie; strozzapreti; casarecce; paccheri; mafaldine|mafalde|reginette; gemelli; anelli; cavatelli; garganelli; agnolotti; stelline; fregola; corzetti; lumache; calamarata; malloreddus; pici; bigoli; busiate; tajarin; mezzelune; scialatielli; cappelletti; orecchioni',
    },
  },
  {
    id: 'africa',
    text: 'Name a country in Africa',
    tiers: {
      1: 'egypt; south africa; nigeria; kenya; morocco; ethiopia',
      2: 'ghana; algeria; tanzania; uganda; libya; tunisia; zimbabwe; somalia; sudan; senegal; DR Congo|democratic republic of the congo|drc|dr congo|congo kinshasa; madagascar; rwanda; cameroon',
      3: 'angola; mozambique; namibia; botswana; zambia; mali; ivory coast|cote divoire; niger; chad; south sudan; sierra leone; liberia; malawi; eritrea; mauritius; burkina faso; republic of the congo|congo|congo brazzaville',
      4: 'djibouti; eswatini|swaziland; lesotho; gabon; benin; togo; guinea; guinea bissau; equatorial guinea; gambia; cape verde|cabo verde; comoros; seychelles; sao tome and principe|sao tome; burundi; central african republic; mauritania',
    },
  },
  {
    id: 'dogs',
    text: 'Name a breed of dog',
    tiers: {
      1: 'labrador|lab|labrador retriever; golden retriever|golden; german shepherd|alsatian; poodle; bulldog|english bulldog|british bulldog; beagle; chihuahua; pug',
      2: 'husky|siberian husky; dachshund|sausage dog|wiener dog; rottweiler; boxer; border collie|collie; great dane; doberman|dobermann|doberman pinscher; shih tzu; french bulldog|frenchie; yorkshire terrier|yorkie; corgi|welsh corgi; pomeranian; jack russell|jack russell terrier; dalmatian; greyhound; cocker spaniel|spaniel; pit bull|pitbull|american pit bull terrier; maltese',
      3: 'bernese mountain dog; saint bernard|st bernard; shiba inu|shiba; akita; samoyed; newfoundland; bichon frise|bichon; cavalier king charles spaniel|cavalier|king charles spaniel; whippet; bloodhound; basset hound|basset; weimaraner; staffordshire bull terrier|staffy|staffie; schnauzer; mastiff; australian shepherd|aussie; alaskan malamute|malamute; west highland terrier|westie; scottish terrier|scottie; afghan hound; chow chow|chow; vizsla; cockapoo; labradoodle; goldendoodle; boston terrier; shar pei; rhodesian ridgeback; papillon',
      4: 'basenji; komondor; puli; xoloitzcuintli|xolo|mexican hairless; borzoi; saluki; leonberger; otterhound; lagotto romagnolo; kooikerhondje; affenpinscher; schipperke; bergamasco; azawakh; norwegian lundehund; catahoula; tibetan mastiff; coton de tulear; keeshond; briard; kuvasz; plott hound; sloughi; thai ridgeback',
    },
  },
  {
    id: 'fruit',
    text: 'Name a fruit',
    tiers: {
      1: 'apple; banana; orange; strawberry; grape; pear; watermelon; mango; pineapple',
      2: 'cherry; peach; lemon; lime; blueberry; raspberry; kiwi|kiwifruit; plum; grapefruit; melon; cantaloupe; honeydew; coconut; pomegranate; apricot; blackberry; avocado; tomato; nectarine; papaya; fig',
      3: 'passion fruit; dragon fruit|pitaya; lychee|litchi; guava; persimmon; date; cranberry; tangerine; mandarin; clementine; gooseberry; quince; star fruit|carambola; kumquat; elderberry; blackcurrant|currant|redcurrant; olive; jackfruit; boysenberry; mulberry',
      4: 'durian; rambutan; mangosteen; feijoa; ugli fruit|ugli; salak|snake fruit; cherimoya|custard apple; soursop|guanabana; longan; loquat; jabuticaba; medlar; pawpaw; tamarillo; sapodilla; ackee; cloudberry; lingonberry; yuzu; miracle fruit; physalis|cape gooseberry|goldenberry; huckleberry; marionberry; pluot; buddhas hand',
    },
  },
  {
    id: 'veg',
    text: 'Name a vegetable',
    tiers: {
      1: 'carrot; potato; broccoli; lettuce; onion; tomato; cucumber; peas; corn|sweetcorn|maize',
      2: 'spinach; cabbage; cauliflower; celery; bell pepper|pepper|capsicum; mushroom; garlic; zucchini|courgette; eggplant|aubergine; green beans|beans|string beans; asparagus; sweet potato; kale; brussels sprouts|sprouts; beetroot|beet; radish; leek; pumpkin; squash|butternut squash',
      3: 'artichoke; parsnip; turnip; swede|rutabaga; okra|ladies fingers; fennel; bok choy|pak choi; arugula|rocket; chard|swiss chard; watercress; shallot; yam; edamame; chili pepper|chilli|chili|jalapeno; endive; spring onion|scallion|green onion; collard greens|collards; snow peas|mangetout; rhubarb; horseradish; radicchio',
      4: 'kohlrabi; salsify; celeriac; jicama; romanesco; samphire; fiddlehead|fiddlehead fern; sunchoke|jerusalem artichoke; cardoon; daikon; lotus root; burdock; taro; cassava|yuca|manioc; chayote; kalettes; mizuna; tatsoi; ramps|wild garlic; nopales|nopal; bitter melon|karela; celtuce; oca; skirret',
    },
  },
  {
    id: 'cheese',
    text: 'Name a cheese',
    tiers: {
      1: 'cheddar; mozzarella; parmesan|parmigiano|parmigiano reggiano; swiss; brie',
      2: 'gouda; feta; camembert; blue cheese|blue; goat cheese|goats cheese|chevre; ricotta; cream cheese; stilton; gorgonzola; edam; provolone; monterey jack|jack; colby; halloumi; mascarpone; emmental|emmentaler; gruyere; cottage cheese; american cheese|american; pepper jack; roquefort; manchego; havarti',
      3: 'pecorino|pecorino romano; burrata; wensleydale; red leicester|leicester; double gloucester; jarlsberg; paneer; munster|muenster; fontina; asiago; comte; raclette; boursin; queso fresco; string cheese; port salut; caerphilly; lancashire; cheshire; taleggio; limburger; reblochon; quark',
      4: 'epoisses; stinking bishop; casu marzu; oaxaca|queso oaxaca; cotija; tete de moine; vacherin|vacherin mont dor; brunost|gjetost; manouri; graviera; idiazabal; mahon; cabrales; tomme; saint nectaire; morbier; pont leveque; livarot; mimolette; shropshire blue; cornish yarg|yarg; caciocavallo; scamorza; stracchino; robiola; leerdammer; pule; danbo; kashkaval; akkawi',
    },
  },
  {
    id: 'instrument',
    text: 'Name a musical instrument',
    tiers: {
      1: 'guitar; piano; drums; violin; trumpet; flute',
      2: 'saxophone|sax; cello; clarinet; harp; trombone; bass guitar|bass; double bass|upright bass|contrabass; ukulele|uke; keyboard; harmonica; tuba; accordion; xylophone; banjo; organ; tambourine; recorder; viola; oboe; french horn|horn; triangle; bagpipes; synthesizer|synth',
      3: 'bassoon; mandolin; piccolo; glockenspiel; marimba; harpsichord; sitar; bongos; congas; didgeridoo; cymbals; timpani|kettle drum; kazoo; cornet; euphonium; maracas; castanets; steel drum|steel pan|steelpan; vibraphone|vibes; lute; zither; bodhran; bugle; tabla; ocarina; djembe; cowbell',
      4: 'theremin; hurdy gurdy; erhu; koto; shamisen; oud; balalaika; kalimba|thumb piano|mbira; handpan|hang drum; celesta; sousaphone; dulcimer; nyckelharpa; shakuhachi; duduk; bandoneon; cajon; guzheng; pipa; gamelan; mellotron; ondes martenot; crwth; sackbut; contrabassoon; flugelhorn; cor anglais|english horn; washboard; mridangam; santoor; tanpura; bouzouki; charango; kora',
    },
  },
  {
    id: 'us-state',
    text: 'Name a US state',
    tiers: {
      1: 'california; texas; florida; new york; hawaii; alaska',
      2: 'washington; illinois; ohio; georgia; nevada; arizona; colorado; michigan; massachusetts; pennsylvania; new jersey; louisiana; tennessee; oregon; virginia; north carolina; utah',
      3: 'kentucky; alabama; mississippi; missouri; minnesota; wisconsin; indiana; south carolina; oklahoma; kansas; iowa; new mexico; maryland; connecticut; maine; montana; idaho; arkansas; nebraska; vermont; west virginia',
      4: 'wyoming; north dakota; south dakota; delaware; rhode island; new hampshire',
    },
  },
  {
    id: 'eu-capital',
    text: 'Name a capital city in Europe',
    tiers: {
      1: 'london; paris; rome; berlin; madrid',
      2: 'amsterdam; dublin; lisbon; vienna; athens; brussels; prague; moscow; stockholm; oslo; copenhagen; budapest; warsaw; helsinki; bern; reykjavik',
      3: 'edinburgh; cardiff; belfast; bucharest; sofia; belgrade; zagreb; kyiv|kiev; bratislava; ljubljana; tallinn; riga; vilnius; minsk; luxembourg; monaco; ankara; sarajevo',
      4: 'vaduz; andorra la vella; san marino; vatican city|vatican; podgorica; chisinau; skopje; tirana; valletta; nicosia; tbilisi; yerevan; baku; pristina; torshavn',
    },
  },
  {
    id: 'element',
    text: 'Name a chemical element',
    tiers: {
      1: 'oxygen; hydrogen; carbon; gold; iron; helium',
      2: 'nitrogen; silver; copper; sodium; calcium; lead; uranium; neon; aluminium|aluminum; zinc; mercury; potassium; chlorine; platinum; lithium; magnesium; sulfur|sulphur; silicon; tin; plutonium; fluorine; phosphorus; titanium; nickel',
      3: 'argon; cobalt; radium; iodine; chromium; tungsten; boron; krypton; xenon; radon; manganese; beryllium; arsenic; bromine; caesium|cesium; barium; strontium; cadmium; palladium; bismuth; francium; selenium; thorium; osmium; iridium; einsteinium; polonium; americium; zirconium; gallium; germanium; antimony; vanadium; tellurium; indium',
      4: 'scandium; yttrium; niobium; molybdenum; technetium; ruthenium; rhodium; hafnium; tantalum; rhenium; thallium; astatine; actinium; protactinium; neptunium; curium; berkelium; californium; fermium; mendelevium; nobelium; lawrencium; rutherfordium; dubnium; seaborgium; bohrium; hassium; meitnerium; darmstadtium; roentgenium; copernicium; nihonium; flerovium; moscovium; livermorium; tennessine; oganesson; lanthanum; cerium; praseodymium; neodymium; promethium; samarium; europium; gadolinium; terbium; dysprosium; holmium; erbium; thulium; ytterbium; lutetium; rubidium',
    },
  },
  {
    id: 'bird',
    text: 'Name a bird',
    tiers: {
      1: 'eagle; robin; pigeon; crow; parrot; owl; penguin; duck; chicken',
      2: 'sparrow; seagull|gull; flamingo; hawk; swan; ostrich; pelican; peacock|peafowl; blue jay|jay; cardinal; hummingbird; woodpecker; turkey; falcon; goose; dove; raven; magpie; vulture; heron; emu; blackbird; toucan; kingfisher; canary; budgie|budgerigar|parakeet; starling; stork; cockatoo; crane',
      3: 'wren; finch; puffin; kiwi; albatross; condor; macaw; osprey; kookaburra; pheasant; quail; partridge; skylark|lark; thrush; nightingale; cuckoo; swallow; swift; kestrel; buzzard; egret; ibis; cormorant; roadrunner; oriole; mockingbird; cassowary; lovebird; mallard; grouse; bluebird; chickadee; blue tit|great tit|tit; goldfinch; nuthatch; sandpiper; loon; dodo',
      4: 'shoebill; hoatzin; kakapo; quetzal; lyrebird; bowerbird; hoopoe; secretary bird; frigatebird; booby|blue footed booby; tern|arctic tern; plover; avocet; curlew; godwit; dunnock; wagtail; treecreeper; bittern; capercaillie; ptarmigan; nightjar; potoo; tanager; grackle; junco; towhee; waxwing; jacana; oxpecker; hornbill; turaco; motmot; sunbird; galah; rhea; takahe; kea; corncrake; gannet; skua; razorbill; guillemot; phalarope; dipper',
    },
  },
  {
    id: 'shakespeare',
    text: 'Name a Shakespeare play',
    tiers: {
      1: 'romeo and juliet; hamlet; macbeth',
      2: 'othello; king lear; a midsummer nights dream|midsummer nights dream|a midsummers night dream; the tempest; julius caesar; the merchant of venice; much ado about nothing; twelfth night; the taming of the shrew',
      3: 'as you like it; richard iii|richard the third|richard 3; henry v|henry the fifth|henry 5; antony and cleopatra; the winters tale; the comedy of errors; the merry wives of windsor; measure for measure; coriolanus; titus andronicus; alls well that ends well; richard ii|richard the second|richard 2',
      4: 'cymbeline; pericles|pericles prince of tyre; timon of athens; troilus and cressida; loves labours lost|loves labors lost; the two gentlemen of verona; henry iv|henry the fourth|henry 4; henry vi|henry the sixth|henry 6; henry viii|henry the eighth|henry 8; king john; the two noble kinsmen; edward iii|edward the third',
    },
  },
  {
    id: 'board-game',
    text: 'Name a board game',
    tiers: {
      1: 'monopoly; chess; scrabble; clue|cluedo; checkers|draughts; risk',
      2: 'catan|settlers of catan; trivial pursuit; the game of life|life; battleship; connect four|connect 4; jenga; pictionary; operation; sorry; guess who; candy land; backgammon; ticket to ride; mouse trap; snakes and ladders|chutes and ladders; ludo|parcheesi|pachisi; go; stratego; boggle; twister; hungry hungry hippos; mastermind; othello|reversi',
      3: 'pandemic; carcassonne; codenames; dominion; mahjong|mah jong; cranium; dixit; azul; splendor; scattergories; balderdash; taboo; 7 wonders|seven wonders; king of tokyo; axis and allies; diplomacy; heroquest; kingdomino; love letter; sushi go; wingspan; terraforming mars; gloomhaven; small world; arkham horror; the resistance; mancala; chinese checkers; trouble; perfection',
      4: 'agricola; puerto rico; twilight imperium; through the ages; brass|brass birmingham; power grid; el grande; tigris and euphrates; acquire; hive; tzolkin; root; spirit island; scythe; caylus; le havre; viticulture; everdell; cascadia; patchwork; onitama; santorini; shogi; xiangqi|chinese chess; hnefatafl|tafl; nine mens morris; senet; royal game of ur|game of ur; crokinole; carrom; abalone; blokus; quoridor; dune imperium|dune; coup; mysterium; tokaido',
    },
  },
  {
    id: 'cocktail',
    text: 'Name a cocktail',
    tiers: {
      1: 'margarita; mojito; martini; pina colada; cosmopolitan|cosmo',
      2: 'old fashioned; manhattan; daiquiri; bloody mary; long island iced tea|long island; mai tai; moscow mule; negroni; whiskey sour|whisky sour; gin and tonic|gin tonic|g and t; sex on the beach; tequila sunrise; screwdriver; white russian; espresso martini; aperol spritz|spritz; caipirinha; cuba libre|rum and coke; mimosa',
      3: 'sidecar; tom collins; mint julep; sazerac; paloma; dark and stormy|dark n stormy; bellini; french 75; gimlet; boulevardier; amaretto sour; pisco sour; zombie; hurricane; black russian; kir royale|kir; singapore sling; bramble; sangria; mudslide; appletini; blue lagoon; rob roy; irish coffee; hot toddy; grasshopper; brandy alexander; michelada; caesar|bloody caesar; vesper',
      4: 'aviation; last word; corpse reviver; penicillin; ramos gin fizz|ramos fizz; vieux carre; hanky panky; bees knees; paper plane; clover club; jungle bird; painkiller; mary pickford; sherry cobbler; pegu club; jack rose; bijou; el presidente; hemingway daiquiri; naked and famous; gold rush; brooklyn; martinez; tuxedo; white lady; southside; fish house punch; caipiroska; tommys margarita; trinidad sour; airmail; 20th century|twentieth century',
    },
  },
  {
    id: 'spice',
    text: 'Name a herb or spice',
    tiers: {
      1: 'basil; oregano; black pepper|pepper; cinnamon; garlic; parsley; rosemary; thyme; mint',
      2: 'paprika; cumin; ginger; coriander|cilantro; nutmeg; turmeric; chili powder|chili|chilli; dill; sage; bay leaf|bay leaves|bay; cloves; chives; cayenne|cayenne pepper; curry powder|curry; saffron; vanilla; tarragon; allspice; cardamom|cardamon',
      3: 'fennel|fennel seed; star anise; mustard seed|mustard; lemongrass; marjoram; fenugreek; sumac; caraway; aniseed|anise; juniper|juniper berries; garam masala; chervil; lavender; zaatar|za atar; smoked paprika; white pepper; five spice|chinese five spice; celery seed; poppy seed; sesame|sesame seed; mace; horseradish; wasabi; lovage; savory',
      4: 'asafoetida|hing; galangal; grains of paradise; sichuan pepper|szechuan pepper; nigella|kalonji|black seed; epazote; annatto|achiote; mahlab|mahleb; amchur|amchoor|mango powder; long pepper; ajwain|carom; shiso|perilla; sorrel; borage; hyssop; rue; angelica; pink peppercorn; makrut lime leaf|kaffir lime leaf|lime leaf; curry leaf|curry leaves; berbere; ras el hanout; baharat; dukkah; shichimi togarashi|shichimi|togarashi; sansho; tonka bean|tonka; liquorice root|licorice root; orris root; cubeb; anardana; black lime|loomi',
    },
  },
  {
    id: 'dinosaur',
    text: 'Name a dinosaur (or prehistoric reptile)',
    tiers: {
      1: 'tyrannosaurus rex|tyrannosaurus|t rex; triceratops; velociraptor|raptor; stegosaurus; brontosaurus',
      2: 'brachiosaurus; pterodactyl; diplodocus; ankylosaurus; spinosaurus; allosaurus; iguanodon; parasaurolophus; pachycephalosaurus; apatosaurus; pteranodon; dilophosaurus',
      3: 'carnotaurus; gallimimus; giganotosaurus; compsognathus; deinonychus; megalosaurus; archaeopteryx; mosasaurus; plesiosaurus; utahraptor; baryonyx; therizinosaurus; maiasaura; oviraptor; protoceratops; styracosaurus; argentinosaurus; edmontosaurus; troodon; corythosaurus; microraptor; dimetrodon; ceratosaurus; suchomimus',
      4: 'amargasaurus; nigersaurus; kentrosaurus; ouranosaurus; dracorex; stygimoloch; pachyrhinosaurus; mamenchisaurus; sauropelta; minmi; mussaurus; patagotitan; dreadnoughtus; yutyrannus; tarbosaurus; albertosaurus; daspletosaurus; coelophysis; herrerasaurus; eoraptor; plateosaurus; camarasaurus; carcharodontosaurus; irritator; einiosaurus; zuniceratops; nodosaurus; borealopelta; psittacosaurus; sinosauropteryx; halszkaraptor; deinocheirus; quetzalcoatlus; ichthyosaurus; elasmosaurus; liopleurodon; euoplocephalus; gigantoraptor',
    },
  },
  {
    id: 'greek-god',
    text: 'Name a Greek god or goddess',
    tiers: {
      1: 'zeus; poseidon; hades; athena; aphrodite; apollo',
      2: 'hera; ares; hermes; artemis; dionysus; hephaestus; demeter; persephone; nike; eros; kronos|cronus; gaia|gaea',
      3: 'hestia; hecate; pan; helios; selene; eos; nyx; morpheus; hypnos; thanatos; nemesis; tyche; iris; hebe; uranus|ouranos; rhea; atlas; prometheus; nereus; triton; asclepius; the muses|muse; the fates|moirai; eris',
      4: 'erebus; chaos; tartarus; aether; hemera; pontus; oceanus; tethys; themis; mnemosyne; hyperion; theia; coeus; phoebe; crius; iapetus; metis; leto; dione; harmonia; enyo; deimos; phobos; aeolus; boreas; zephyrus; notus; eurus; priapus; hymen; plutus; momus; ananke; achlys; kratos; bia; zelus; proteus; amphitrite; thalassa; circe; calliope; clio; thalia; eileithyia; the graces|charites; peitho',
    },
  },
  {
    id: 'fish',
    text: 'Name a type of fish',
    tiers: {
      1: 'salmon; tuna; cod; goldfish; shark; trout',
      2: 'sea bass|bass; catfish; haddock; mackerel; sardine; anchovy; swordfish; halibut; tilapia; clownfish; carp; piranha; barracuda; marlin; herring; pike; snapper|red snapper; sole; plaice; stingray|ray; eel; pufferfish|blowfish|fugu; angelfish; betta|siamese fighting fish|fighting fish; koi; guppy; seahorse',
      3: 'monkfish; mahi mahi|dorado|dolphinfish; perch; flounder; grouper; sturgeon; lionfish; tetra|neon tetra; minnow; zebrafish; turbot; sea bream|bream; hake; pollock; whiting; mullet|red mullet; anglerfish; sunfish|mola mola|mola; manta ray|manta; walleye; bluegill; sailfish; wahoo; tarpon; mudskipper; parrotfish; triggerfish; blue tang|tang|surgeonfish; molly; swordtail; oscar; discus; arapaima; lungfish; coelacanth; hagfish; lamprey; gar|alligator gar; muskie|muskellunge',
      4: 'wrasse; goby; blenny; snook; bonefish; permit; john dory|dory; skate; dogfish; ling; opah; escolar; barramundi; murray cod; arowana; arctic char|char; grayling; tench; roach; chub; dace; rudd; zander; burbot; oarfish; frogfish; hatchetfish; stonefish; batfish; sheepshead; tilefish; grunion; capelin; smelt; sprat; pilchard; shad; menhaden; sablefish|black cod; lingcod; cobia; amberjack; yellowtail|hamachi; bonito; wolffish; huchen; taimen; snakehead',
    },
  },
  {
    id: 'car-brand',
    text: 'Name a car brand',
    tiers: {
      1: 'toyota; ford; honda; BMW; mercedes|mercedes benz|benz; tesla; chevrolet|chevy',
      2: 'audi; Volkswagen|vw; nissan; ferrari; lamborghini; porsche; hyundai; kia; jeep; mazda; subaru; volvo; dodge; jaguar; land rover|range rover; lexus; fiat; mini; peugeot; renault',
      3: 'bugatti; maserati; bentley; rolls royce; aston martin; McLaren|mclaren; cadillac; lincoln; buick; GMC|gmc; chrysler; ram; mitsubishi; suzuki; infiniti; acura; alfa romeo; skoda; seat; citroen; opel; vauxhall; genesis; lotus; BYD|byd; polestar; rivian; dacia; saab; lucid',
      4: 'koenigsegg; pagani; rimac; lada; tata; mahindra; proton; perodua; holden; pontiac; oldsmobile; plymouth; saturn; hummer; mercury; datsun; triumph; rover; MG|mg; morgan; TVR|tvr; caterham; lancia; abarth; cupra; smart; NIO|nio; xpeng; geely; chery; great wall; zeekr; maybach; DeLorean|delorean; studebaker; packard; SsangYong|ssangyong|kgm; isuzu; daihatsu; scion; trabant; yugo; vinfast',
    },
  },
  {
    id: 'bone',
    text: 'Name a bone in the human body',
    tiers: {
      1: 'femur|thigh bone; skull|cranium; ribs; spine|backbone|vertebra|vertebrae|spinal column',
      2: 'tibia|shin bone; humerus; pelvis|hip bone|hip; jaw|jawbone|mandible; collarbone|clavicle; kneecap|patella; radius; ulna; fibula; sternum|breastbone; shoulder blade|scapula',
      3: 'coccyx|tailbone; sacrum; metacarpals; metatarsals; phalanges|phalanx|finger bone|toe bone; carpals|wrist bone; tarsals; maxilla; hyoid; stapes|stirrup; incus|anvil; malleus|hammer; ilium; ischium; pubis; atlas; axis; calcaneus|heel bone; talus|ankle bone; temporal bone|temporal; occipital bone|occipital; frontal bone|frontal; parietal bone|parietal; zygomatic|cheekbone; nasal bone',
      4: 'scaphoid; lunate; triquetrum; pisiform; trapezium; trapezoid; capitate; hamate; navicular; cuboid; cuneiform; sphenoid; ethmoid; vomer; lacrimal; palatine; sesamoid; xiphoid process|xiphoid; manubrium; nasal concha|concha',
    },
  },
  {
    id: 'olympic',
    text: 'Name an Olympic sport',
    tiers: {
      1: 'swimming; athletics|track and field|track; gymnastics; football|soccer; basketball; tennis; boxing',
      2: 'cycling; volleyball; diving; rowing; wrestling; fencing; judo; archery; skiing; figure skating|skating; ice hockey|hockey; field hockey; weightlifting; sailing; equestrian|horse riding|show jumping|dressage; badminton; table tennis|ping pong; golf; rugby|rugby sevens; handball; water polo; snowboarding; marathon; sprinting|100m; high jump; long jump; triathlon; taekwondo; surfing; skateboarding; canoeing|kayaking|canoe|kayak',
      3: 'curling; bobsleigh|bobsled; luge; skeleton; biathlon; pole vault; javelin; discus; shot put; hammer throw; modern pentathlon|pentathlon; decathlon; heptathlon; artistic swimming|synchronized swimming|synchronised swimming; trampoline; BMX|bmx; mountain biking; speed skating; ski jumping; sport climbing|climbing; breaking|breakdancing; shooting; softball; baseball; beach volleyball; karate; hurdles; steeplechase; race walking|racewalking; rhythmic gymnastics',
      4: 'nordic combined; short track; freestyle skiing|moguls; slopestyle; halfpipe; ski cross; snowboard cross; alpine skiing|slalom|giant slalom|downhill|super g; cross country skiing; open water swimming|marathon swimming; keirin; omnium; madison; team pursuit; canoe slalom; trap shooting|skeet; lacrosse; cricket; flag football; squash; tug of war; polo; croquet; jeu de paume; rackets; roque; motorboating; art competitions; plunge for distance; rope climbing; club swinging',
    },
  },
  {
    id: 'tree',
    text: 'Name a type of tree',
    tiers: {
      1: 'oak; pine; maple; palm|palm tree; apple tree; birch; willow|weeping willow',
      2: 'elm; ash; redwood; sequoia|giant sequoia; cherry|cherry tree|cherry blossom; spruce; fir|douglas fir; cedar; beech; sycamore; cypress; poplar; christmas tree; eucalyptus|gum tree; chestnut|horse chestnut; walnut; magnolia; banyan; baobab; holly; yew',
      3: 'hawthorn; rowan|mountain ash; alder; larch; hemlock; aspen; hickory; dogwood; juniper; olive; fig; linden|lime; hazel; acacia; mahogany; teak; ebony; jacaranda; cottonwood; sweetgum; tulip tree; mango; joshua tree; monkey puzzle; ginkgo|gingko; elder; london plane|plane; laurel; boxwood|box; balsa; rubber tree; cork oak; black locust|locust',
      4: 'hornbeam; wych elm; sassafras; tupelo; catalpa; paulownia; dawn redwood|metasequoia; wollemi pine; bristlecone pine; dragon tree|dragons blood tree; kapok; sandalwood; rosewood; cocobolo; lignum vitae; kauri; totara; rimu; pohutukawa; jarrah; karri; boab; buckeye; persimmon; pawpaw; osage orange; ironwood; blackthorn; whitebeam; service tree; spindle; hackberry; mesquite; palo verde; ceiba; sapele; wenge; zelkova; tamarind; moringa; neem; deodar; cedar of lebanon; arbutus|strawberry tree',
    },
  },
  {
    id: 'dance',
    text: 'Name a style of dance',
    tiers: {
      1: 'ballet; salsa; tango; hip hop; waltz; tap|tap dance|tap dancing',
      2: 'breakdancing|breakdance|breaking; swing; jazz; contemporary; ballroom; cha cha|cha cha cha; foxtrot; rumba; samba; line dancing|line dance; disco; flamenco; belly dancing|belly dance; square dancing|square dance; irish dancing|irish dance|riverdance; twerking|twerk; macarena; conga',
      3: 'jive; lindy hop; charleston; quickstep; paso doble; bachata; merengue; zumba; krump; popping; locking; voguing|vogue; moonwalk; polka; cancan|can can; hula; bollywood; bhangra; kathak; bharatanatyam; morris dancing|morris; ceilidh; clog dancing|clogging; mambo; lambada; pole dancing|pole dance; capoeira; tutting; shuffle|melbourne shuffle; electric slide; the twist|twist; the floss|floss',
      4: 'kizomba; zouk; forro; west coast swing; balboa; shag|carolina shag; jitterbug; hustle; bolero; tarantella; sardana; jota; sevillanas; fandango; polonaise; mazurka; minuet; gavotte; pavane; galliard; quadrille; reel; jig; strathspey; sirtaki; hora; kolo; csardas; haka; tinikling; kecak; odissi; kuchipudi; garba; dabke; butoh; lion dance; dragon dance; cueca; cumbia; joropo; marinera; gumboot dance|gumboot; pantsula; azonto; kuduro; schuhplattler; tanoura; sword dance; maypole dance|maypole',
    },
  },
  {
    id: 'currency',
    text: 'Name a currency (past or present)',
    tiers: {
      1: 'dollar|us dollar|american dollar|canadian dollar|australian dollar|new zealand dollar|hong kong dollar|singapore dollar; euro; pound|pound sterling|british pound|sterling; yen|japanese yen',
      2: 'peso|mexican peso; rupee|indian rupee; franc|swiss franc; yuan|renminbi|rmb; ruble|rouble; won|korean won; real|brazilian real; krona|krone|kronor|kroner; dinar; rand; lira|turkish lira',
      3: 'shekel|new shekel; baht; rupiah; ringgit; dirham; riyal; rial; zloty; forint; koruna; lev; leu; dong; drachma; deutschmark|deutsche mark|mark; escudo; guilder; peseta; kwacha; naira; shilling; cedi; sol',
      4: 'kwanza; birr; dalasi; pula; loti; lilangeni; ariary; ouguiya; leone; nakfa; tenge; som; somoni; manat; lari; dram; hryvnia; denar; kuna; lempira; quetzal; colon; cordoba; balboa; guarani; boliviano; bolivar; gourde; taka; ngultrum; kyat; kip; riel; tugrik; afghani; rufiyaa; pataca; paanga; tala; vatu; kina; florin; tolar; markka; sucre',
    },
  },
];
