// Indonesian: the quests, the villagers and the places (core/quests, core/questplan, core/npcs
// and the quest panel). The templates are said as whole Indonesian sentences: the noun first and
// its little word after it ("kuncinya", "yang kamu cari").
export default {

  // --- core/quests.js: where the givers stand -------------------------------------------------------
  "on the inn's porch in town": 'di serambi penginapan di kota',
  'at the stable in town': 'di kandang di kota',
  'at the anvil in town': 'di landasan di kota',
  'by the pet shop in town': 'di dekat toko hewan di kota',
  'in the merchant camp': 'di perkemahan pedagang',

  // --- core/quests.js: guardians and places ----------------------------------------------------------
  'first guardian': 'penjaga pertama',
  'second guardian': 'penjaga kedua',
  'third guardian': 'penjaga ketiga',
  'fourth guardian': 'penjaga keempat',
  'road out of town': 'jalan keluar kota',
  'depth {depth}': 'kedalaman {depth}',
  'at the camp on {where:the}': 'di kamp di {where:the}',
  'on {where:the}': 'di {where:the}',
  'Meadows': 'Padang',

  // --- core/quests.js: number words --------------------------------------------------------------------
  'no': 'nol',
  'one': 'satu',
  'two': 'dua',
  'three': 'tiga',
  'four': 'empat',
  'five': 'lima',

  // --- core/quests.js: the quest kinds and their words ---------------------------------------------------
  "{owner:the}'s {thing:lower}": '{thing:lower} milik {owner:the}',
  'Down to depth {depth}': 'Turun ke kedalaman {depth}',
  'Travellers talk about {place:the}, down on depth {depth}. Nobody I know has been there. Go and see, and come back to tell me what it is like.':
    'Para pengelana bercerita tentang {place:the}, jauh di kedalaman {depth}. Tak seorang pun yang saya kenal pernah ke sana. Pergi lihat, lalu kembali ceritakan padaku seperti apa di sana.',
  'I have heard of {place:the}, deep down on depth {depth}. Will you go there for me? Then come back and tell me all about it.':
    'Saya pernah dengar tentang {place:the}, jauh di kedalaman {depth}. Maukah kamu pergi ke sana untukku? Lalu kembali dan ceritakan semuanya padaku.',
  'Reach depth {depth} ({place:the})': 'Capai kedalaman {depth} ({place:the})',
  '{landmark:The}': '{landmark:cap}',
  'Somewhere in {place:the} on depth {depth} there is {landmark:a}. My grandmother told me about it. Find it, stand beside it, and come back to tell me it is really there.':
    'Di suatu tempat di {place:the} pada kedalaman {depth} ada {landmark:a}. Nenek saya pernah bercerita tentangnya. Temukan, berdirilah di sampingnya, dan kembali ceritakan padaku bahwa ia benar-benar ada.',
  'They say {landmark:a} stands in {place:the}, on depth {depth}. I would love to know what it looks like. Find it for me and come back.':
    'Katanya {landmark:a} berdiri di {place:the}, pada kedalaman {depth}. Aku ingin sekali tahu seperti apa bentuknya. Temukan untukku dan kembalilah.',
  'Find {landmark:the} on depth {depth}': 'Temukan {landmark:the} di kedalaman {depth}',
  'Beat {boss}': 'Kalahkan {boss}',
  'The guardian of the well': 'Penjaga sumur',
  '{boss} guards the way down from {where:the}, and nobody gets past. Beat {boss}, and come back to tell me the way is open.':
    '{boss} menjaga jalan turun dari {where:the}, dan tak seorang pun bisa lewat. Kalahkan {boss}, lalu kembali beri tahu saya bahwa jalannya sudah terbuka.',
  'The way down from {where:the} is guarded by something big. Beat the guardian of the well and come back to tell me.':
    'Jalan turun dari {where:the} dijaga sesuatu yang besar. Kalahkan penjaga sumurnya dan kembali beri tahu saya.',
  'A guardian sits by the well at the end of {where:the}. Nobody gets down while it is there. Beat it, then come back.':
    'Satu penjaga duduk di samping sumur di ujung {where:the}. Tak ada yang bisa turun selama ia di sana. Kalahkan ia, lalu kembalilah.',
  'Defeat {boss} on {where:the}': 'Kalahkan {boss} di {where:the}',
  'Defeat the Temp Boss on {where:the}': 'Kalahkan Bos Sementara di {where:the}',
  'next guardian': 'penjaga berikutnya',
  'A gate on {where:the}': 'Sebuah gerbang di {where:the}',
  'On {where:the} a guardian blocks the way through. There are {n} of them; I mean {which:the} you come to. Beat it so the way is open for everyone, then come back.':
    'Di {where:the} ada penjaga menghalangi jalan. Ada {n} di sana; maksud saya {which:the} yang kamu temui. Kalahkan ia supaya jalannya terbuka untuk semua orang, lalu kembalilah.',
  'On {where:the} a guardian blocks the way through. Beat it so the way is open for everyone, then come back.':
    'Di {where:the} ada penjaga menghalangi jalan. Kalahkan ia supaya jalannya terbuka untuk semua orang, lalu kembalilah.',
  '{which:The} on {where:the} has scared off everyone who went that way. Beat it, and come back to tell me.':
    '{which:cap} di {where:the} telah mengusir semua yang lewat ke sana. Kalahkan ia, lalu kembali beri tahu saya.',
  'Defeat {which:the} on {where:the}': 'Kalahkan {which:the} di {where:the}',
  'A horde of {enemy:pl}': 'Gerombolan {enemy:pl}',
  'A whole horde of {enemy:pl} has gathered on {where:the}. Left alone they only get bolder. Break it up, and come back to tell me.':
    'Satu gerombolan penuh {enemy:pl} telah berkumpul di {where:the}. Dibiarkan saja mereka makin berani. Bubarkan, lalu kembali beri tahu saya.',
  'People coming back from {where:the} talk of a horde of {enemy:pl}. Scatter them, every last one, then come back.':
    'Orang-orang yang kembali dari {where:the} bercerita tentang gerombolan {enemy:pl}. Buyarkan mereka, sampai yang terakhir, lalu kembalilah.',
  'Break the horde of {enemy:pl} on {where:the}': 'Bubarkan gerombolan {enemy:pl} di {where:the}',
  'The lost {thing:lower}': '{thing:lower} yang hilang',
  '{label:cap}': '{label:cap}',
  'I lost my {thing:lower} down on {where:the}, {clue}. Could you look for {thing:it} and bring {thing:it} back to me?':
    '{thing:lower} saya hilang di {where:the}, {clue}. Bisakah kamu mencarinya dan membawanya kembali padaku?',
  'My {thing:lower}! I dropped {thing:it} when I ran from the monsters on {where:the}, {clue}. Please bring {thing:it} back.':
    '{thing:lower} saya! Terjatuh ia saat saya lari dari para monster di {where:the}, {clue}. Tolong bawa ia kembali.',
  'I only put my {thing:lower} down for a moment on {where:the}, {clue}, and then something came at me and I ran. Would you fetch {thing:it} for me?':
    'Baru sebentar saya meletakkan {thing:lower} saya di {where:the}, {clue}, lalu ada yang menerjang dan saya lari. Maukah kamu mengambilnya untuk saya?',
  'A big bird snatched my {thing:lower} and let {thing:it} fall on {where:the}, {clue}. Can you get {thing:it} back for me?':
    'Seekor burung besar menyambar {thing:lower} saya dan menjatuhkannya di {where:the}, {clue}. Bisakah kamu mengambilnya kembali untuk saya?',
  'My {relation:lower} {person} left {person:his} {thing:lower} on {where:the}, {clue}. {person} is too scared to go back. Would you fetch {thing:it}?':
    '{person}, {relation:lower} saya, meninggalkan {thing:lower}nya di {where:the}, {clue}. {person} terlalu takut untuk kembali. Maukah kamu mengambilnya?',
  '{person}, my {relation:lower}, was carrying {person:his} {thing:lower} down to {where:the} and dropped {thing:it} {clue}. Please bring {thing:it} back to me.':
    '{person}, {relation:lower} saya, membawa {thing:lower}nya turun ke {where:the} dan terjatuh ia {clue}. Tolong bawa ia kembali padaku.',
  'Somebody saw {label} lying on {where:the}, {clue}. {person} is my {relation:lower}. Would you bring {thing:it} back for us?':
    'Seseorang melihat {label} tergeletak di {where:the}, {clue}. {person} adalah {relation:lower} saya. Maukah kamu membawa {thing:lower}nya kembali untuk kami?',
  'Find {label} on {where:the}': 'Temukan {label} di {where:the}',
  'Where is {person}?': 'Di mana {person}?',
  'My {relation:lower} {person} went down to {where:the} and has not come back. Somebody saw {person:him} {clue}. Please find {person:him}! I will wait here.':
    '{person}, {relation:lower} saya, turun ke {where:the} dan belum kembali juga. Seseorang melihatnya {clue}. Tolong temukan dia! Saya akan menunggu di sini.',
  '{person}, my {relation:lower}, wanted to see {where:the} and never came back. The last I heard, {clue}. Bring {person:him} home to me, please.':
    '{person}, {relation:lower} saya, ingin melihat {where:the} dan tak pernah kembali. Terakhir yang saya dengar, {clue}. Bawa dia pulang ke saya, tolong.',
  'Find {person} on {where:the}': 'Temukan {person} di {where:the}',
  'A map with a cross': 'Peta dengan palang',
  'I found this scrap of an old map. The cross is on {where:the}, {clue}. I am too old to go digging; whatever is there is yours.':
    'Saya menemukan potongan peta tua ini. Palangnya ada di {where:the}, {clue}. Saya terlalu tua untuk menggali; apa pun yang ada di sana menjadi milikmu.',
  'Look at this map scrap! Treasure, on {where:the}, {clue}. Find it, and keep what is in it.':
    'Lihat potongan peta ini! Harta karun, di {where:the}, {clue}. Temukan, dan simpan apa pun isinya.',
  'Find the treasure on {where:the}': 'Temukan harta di {where:the}',
  'Wanted: {name}': 'Dicari: {name}',
  '{bounty:cap} has been seen on {where:the}, {clue}. It is bigger and meaner than the others of its kind. Beat it, and come back for the reward.':
    '{bounty:cap} terlihat di {where:the}, {clue}. Ia lebih besar dan lebih buas dari yang lain sejenisnya. Kalahkan ia, lalu kembali untuk hadiahnya.',
  'There is a reward on {name}! {kind:A} the size of a cart, on {where:the}, {clue}. Bring me word it is gone.':
    'Ada hadiah atas {name}! {kind:a} sebesar gerobak, di {where:the}, {clue}. Beri saya kabar bahwa ia sudah tiada.',
  'Defeat {name} on {where:the}': 'Kalahkan {name} di {where:the}',
  'on {where:the}, {clue}': 'di {where:the}, {clue}',
  '{thing:cap} for {name}': '{thing:cap} untuk {name}',
  'Could you take {thing:this} {thing:lower} to {to}, {at}? {name} has been waiting for {thing:it} for a long time.':
    'Bisakah kamu membawa {thing:lower} ini ke {to}, {at}? {name} sudah lama menunggu barangnya.',
  '{thing:This} {thing:lower} must get to {to}, {at}. Nobody else dares to go that far down. {name} will thank you for it.':
    '{thing:lower} ini harus sampai ke {to}, {at}. Tak ada yang berani turun sedalam itu. {name} akan berterima kasih kepadamu.',
  '{to} ({at}) asked me for {thing:this} {thing:lower}, and I promised to send {thing:it}. Would you carry {thing:it} down there for me?':
    '{to} ({at}) meminta {thing:lower} ini, dan saya berjanji mengirimkannya. Maukah kamu membawanya ke sana untuk saya?',
  'I owe {name} a favour. {thing:This} {thing:lower} should make us even. You will find {to} {at}.':
    'Saya berhutang budi pada {name}. {thing:lower} ini harusnya menghapusnya. Kamu akan menemukan {to} {at}.',
  '{name}: At last! Thank you so much. Here, this is for your trouble.':
    '{name}: Akhirnya! Terima kasih banyak. Nah, ini untuk jasamu.',
  '{name}: For me? I hoped {thing:it} would come. Take this, you have earned it.':
    '{name}: Untuk saya? Saya harapkan {thing:lower}nya datang. Ambil ini, kamu layak menerimanya.',
  '{name}: Oh, wonderful! I was beginning to think nobody would come. Here, take this.':
    '{name}: Oh, bagus sekali! Saya mulai mengira tak akan ada yang datang. Nah, ambil ini.',
  'Bring {thing:the} to {to} on {where:the}': 'Bawa {thing:lower}nya ke {to} di {where:the}',
  'Ask {name}': 'Tanya {name}',
  'My {thing:lower} {thing:is} gone, and {to} ({at}) saw where {thing:they} went. Ask {name}, find {thing:it}, and bring {thing:it} back to me.':
    '{thing:lower} saya hilang, dan {to} ({at}) melihat ke mana ia pergi. Tanyakan pada {name}, temukan, dan bawa ia kembali padaku.',
  '{to} found my {thing:lower} once before! Go and ask, {at}. Then bring {thing:it} back to me, please.':
    '{to} pernah menemukan {thing:lower} saya! Pergi tanyakan, {at}. Lalu bawa ia kembali padaku, tolong.',
  'Somebody took my {thing:lower} down below. {to} hears all the gossip down there, {at}. Ask, then bring {thing:it} back to me.':
    'Seseorang membawa pergi {thing:lower} saya ke bawah sana. {to} mendengar semua kabar di bawah sana, {at}. Tanyakan, lalu bawa ia kembali padaku.',
  '{name}: Your {thing:lower}? I saw {thing:it} on {where:the}, {clue}.':
    '{name}: {thing:lower}mu? Saya melihatnya di {where:the}, {clue}.',
  'Ask {to} on {where:the}': 'Tanya {to} di {where:the}',
  'Find {thing:the} on {where:the}, {clue}': 'Temukan {thing:lower}nya di {where:the}, {clue}',
  '{thing:Pl} on {where:the}': '{thing:cap} di {where:the}',
  'A cart tipped over on {where:the}, and {n} {thing:pl} went rolling off all over the place. One was seen {clue}. Could you gather them up and bring them back to me?':
    'Sebuah gerobak terguling di {where:the}, dan {n} {thing:pl} menggelinding ke mana-mana. Satu terlihat {clue}. Bisakah kamu mengumpulkannya dan membawanya kembali padaku?',
  'The monsters on {where:the} ran off with my {thing:pl}, {n} of them, and dropped them here and there. Bring back every one! I think one is {clue}.':
    'Para monster di {where:the} kabur membawa {thing:pl} saya, ada {n}, dan menjatuhkannya ke mana-mana. Bawa kembali semuanya! Sepertinya satu ada {clue}.',
  'I need {n} {thing:pl}, and there are some lying about on {where:the}, one of them {clue}. Would you collect them for me?':
    'Saya butuh {n} {thing:pl}, dan ada beberapa berserakan di {where:the}, salah satunya {clue}. Maukah kamu mengumpulkannya untuk saya?',
  'A great gust of wind blew {n} of my {thing:pl} all over {where:the}. I saw one come down {clue}. Please find them all!':
    'Satu hembusan angin besar menerbangkan {n} {thing:pl} saya ke segala penjuru {where:the}. Saya melihat satu jatuh {clue}. Tolong temukan semuanya!',
  'Collect {n} {thing:pl} on {where:the}': 'Kumpulkan {n} {thing:pl} di {where:the}',
  'The sealed storehouse': 'Lumbung terkunci',
  'Behind a sealed door on {where:the} {keeper} keeps a hidden storehouse, and the monsters have found it. Here is the way in: take it, and help {keeper} hold the cart until they give up.':
    'Di balik pintu terkunci di {where:the}, {keeper} menyimpan lumbung rahasia, dan para monster menemukannya. Ini cara masuknya: pegang ini, dan bantu {keeper} bertahan di gerobaknya sampai mereka menyerah.',
  'There is a door on {where:the} that nobody can open. I can. Behind it, {keeper}\'s storehouse is under attack. Go in and keep them off the cart!':
    'Ada pintu di {where:the} yang tak bisa dibuka siapa pun. Saya bisa. Di baliknya, lumbung milik {keeper} sedang diserang. Masuk dan jauhkan mereka dari gerobaknya!',
  "Defend {keeper}'s storehouse on {where:the}": 'Pertahankan lumbung milik {keeper} di {where:the}',
  'Raiders at the cart': 'Perampok di gerobak',
  'Every night the monsters come for my supply cart. I cannot hold them off alone! When you are ready, stand by the cart and I will ring the bell. Keep them off it until they give up.':
    'Setiap malam para monster datang ke gerobak bekalku. Aku tak bisa mengusir mereka sendirian! Kalau kamu siap, berdirilah di samping gerobak dan aku akan membunyikan belnya. Jauhkan mereka darinya sampai mereka menyerah.',
  'They have been at my cart again, and next time there will be more of them. Will you stand by it with me? Keep them away from it, wave after wave.':
    'Mereka datang lagi ke gerobakku, dan lain kali jumlahnya lebih banyak. Maukah kamu berdiri di sampingnya denganku? Jauhkan mereka darinya, gelombang demi gelombang.',
  "Defend {keeper}'s cart on {where:the}": 'Pertahankan gerobak {keeper} di {where:the}',
  '{title} (again)': '{title} (lagi)',
  'Back again? {text}': 'Kamu kembali? {text}',
  'Archived': 'Diarsipkan',
  'Offered': 'Ditawarkan',
  'Going on': 'Berjalan',
  'Done: back to {giver:the}': 'Selesai: kembali ke {giver:the}',
  'Complete': 'Tuntas',
  'Failed': 'Gagal',
  'somebody': 'seseorang',
  'Somebody': 'Seseorang',

  // --- core/questplan.js: where things wait -----------------------------------------------------------
  'up on the needle of rock': 'di atas jarum batu',
  'on top of the lone peak': 'di puncak gunung yang sunyi',
  'by the great lake': 'di tepi danau besar',
  'at the foot of the great mountain': 'di kaki gunung besar',
  'at the foot of the two bridges': 'di kaki kedua jembatan',
  'up where the high bridge comes back': 'di atas, tempat jembatan tinggi berbalik',
  'below the great cliff': 'di bawah tebing besar',
  'up on the high plateau': 'di atas dataran tinggi',
  'where the plateau comes down': 'di tempat dataran tinggi turun',
  'by the high ground': 'di dekat tanah tinggi',
  'on the island at the end of the long bridge': 'di pulau di ujung jembatan panjang',
  'near {landmark:the}': 'di dekat {landmark:the}',
  'where the horde gathers': 'di tempat gerombolan berkumpul',
  'off the main way': 'sedikit dari jalan utama',
  "past the guardians' gates": 'melewati gerbang para penjaga',
  "past the guardian's gate": 'melewati gerbang penjaga',
  'not far from where the depth begins': 'tidak jauh dari tempat kedalaman dimulai',
  'close to the way down': 'dekat ke jalan turun',
  'about halfway along': 'kira-kira di tengah jalan',
  '{a}, {b}': '{a}, {b}',

  // --- core/npcs.js -------------------------------------------------------------------------------------
  '{name} the {role}': '{name} si {role}',
  'hermit': 'pertapa',
  'explorer': 'penjelajah',
  'miner': 'penambang',
  'pilgrim': 'peziarah',
  'trapper': 'pemburu',
  'scholar': 'ilmuwan',
  'carter': 'kusir',
  'messenger': 'kurir',
  'friend': 'sahabat',
  'apprentice': 'murid',
  'cousin': 'sepupu',
  'daughter': 'anak perempuan',
  'son': 'anak laki-laki',
  'brother': 'saudara laki-laki',
  'sister': 'saudara perempuan',
  'grandson': 'cucu laki-laki',
  'granddaughter': 'cucu perempuan',
  'she|hermit': 'pertapa',
  'she|explorer': 'penjelajah',
  'she|miner': 'penambang',
  'she|pilgrim': 'peziarah',
  'she|trapper': 'pemburu',
  'she|scholar': 'ilmuwan',
  'she|carter': 'kusir',
  'she|messenger': 'kurir',
  'she|friend': 'sahabat',
  'she|apprentice': 'murid',
  'she|cousin': 'sepupu',

  // --- core/quests.js GIVERS -----------------------------------------------------------------------------
  'Innkeeper': 'Pemilik Penginapan',
  'Groom': 'Penjaga Kandang',
  'Pet keeper': 'Penjaga Hewan',

  // --- game/quests.js ------------------------------------------------------------------------------------
  'a quest': 'sebuah tugas',
  '{giver:the}': '{giver:the}',
  '{name}: Thank you!': '{name}: Terima kasih!',
  '{name}: Thank you! I will go back now. Here, take this.': '{name}: Terima kasih! Saya akan pulang sekarang. Nah, ambil ini.',

  // --- game/questworld.js ----------------------------------------------------------------------------------
  'whoever asked': 'yang meminta',
  'That is all of them! Bring them back to {giver:the}': 'Itu sudah semuanya! Bawa semuanya kembali ke {giver:the}',
  'Found one! {have} of {need}': 'Ketemu satu! {have} dari {need}',
  'Found {thing:the}! Bring {thing:it} back to {giver:the}': 'Ketemu {thing:lower}nya! Bawa ia kembali ke {giver:the}',
  'Something big is prowling about here...': 'Sesuatu yang besar berkeliaran di sini...',
  'You hear somebody calling for help!': 'Kamu mendengar seseorang memanggil minta tolong!',
  'Something glints somewhere here...': 'Sesuatu berkilau di suatu tempat di sini...',
  'The cross on the map must be here somewhere!': 'Palang di peta pasti ada di suatu tempat di sini!',

  // --- game/questpanel.js ------------------------------------------------------------------------------------
  'easy': 'mudah',
  'medium': 'sedang',
  'hard': 'sulit',
  '{item} ({rarity} {base})': '{item} ({rarity} {base})',
  'You are back! Did you do what I asked?': 'Kamu kembali! Apa yang saya minta sudah kamu lakukan?',
  'I could use some help...': 'Saya butuh sedikit bantuan...',
  'How is it going?': 'Bagaimana keadaannya?',
  'Nothing for you just now. Come back when you have been further down.': 'Belum ada untukmu sekarang. Kembali setelah kamu turun lebih dalam.',
  "{name}'s quests": 'Tugas {name}',
  'Done': 'Selesai',
  'Nothing else going on.': 'Tak ada lagi yang berjalan.',
  'No quests going on. Talk to the villagers in town and in the merchant camp: a ! over one means a quest for you.':
    'Tak ada tugas yang berjalan. Bicaralah dengan warga di kota dan di perkemahan pedagang: tanda ! di atasnya berarti ada tugas untukmu.',
  'No quests done yet.': 'Belum ada tugas yang selesai.',
  'Nothing archived. Archive a quest to put it away; it waits here until you bring it back.':
    'Belum ada yang diarsipkan. Arsipkan tugas untuk menyimpannya; ia menunggu di sini sampai kamu mengeluarkannya kembali.',
  'Select a quest to read it.': 'Pilih tugas untuk membacanya.',
  'and whatever the treasure holds': 'dan apa pun isi hartanya',
  'Go back to {giver:the} ({where}) to hand it in.': 'Kembali ke {giver:the} ({where}) untuk menyerahkannya.',
  'Go back to {giver:the} to hand it in.': 'Kembali ke {giver:the} untuk menyerahkannya.',
  'Archived: put away. It counts nothing until you bring it back.': 'Diarsipkan: disimpan. Ia tak dihitung sampai kamu mengeluarkannya kembali.',
  'Done! {back}': 'Selesai! {back}',
  'When it is done, come back to {giver:the} for the reward.': 'Setelah selesai, kembali ke {giver:the} untuk hadiahnya.',
  'It failed. Restart it to try again from the beginning.': 'Gagal. Mulai ulang untuk mencoba lagi dari awal.',
  'Complete: everyone in the game got the reward.': 'Tuntas: semua orang di permainan mendapat hadiahnya.',
  'Accept': 'Terima',
  'Hand in': 'Serahkan',
  'Restart': 'Mulai ulang',
  'Following': 'Diikuti',
  'Follow': 'Ikuti',
  'Archive': 'Arsipkan',
  'Unarchive': 'Keluar dari arsip',
  'From {giver:the} · {where} · {difficulty}': 'Dari {giver:the} · {where} · {difficulty}',
  'Goal': 'Tujuan',
  'Carrying': 'Dibawa',
  'Reward': 'Hadiah',
};
