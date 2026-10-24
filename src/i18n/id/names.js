// Generated item names in Indonesian (core/gear/names.js): a word for each English one, in the
// same order (tools/i18n.mjs checks the lists line up), and how they go together. Indonesian puts
// the word that owns a name first and its describing word after it ("Pedang Panjang Becek",
// "Taring Licik"), so the adjective comes last here; a compound is said as one CamelCase word
// ("BadaiPerampok"), and an enchantment is said after the name ("… Panggang"). No gender, so the
// words need no markings.

const words = {
  CRAP: ['Becek', 'Goyah', 'Terkunyah', 'Miring', 'Berjamur', 'Berdecit', 'Berkarat', 'Bengkok', 'Sedih', 'Lembap'],
  SHITTY: ['Penyok', 'Terkupas', 'Tumpul', 'Ajur', 'Pinjaman', 'Diskon', 'Bekas', 'Berderit', 'Tergores', 'Meragukan'],
  VANILLA: ['Besi', 'Kokoh', 'Milisi', 'Polos', 'Baku', 'Biasa', 'Andalan', 'Sehari-hari', 'Masuk Akal', 'Penjaga'],
  MEH: ['Cukup Baik', 'Memadai', 'Layak Pakai', 'Lumayan', 'Tidak Khas', 'Krem', 'Mudah Dilupakan', 'Tidak Masalah'],
  ADJ: ['Cerah', 'Tajam', 'Geram', 'Cemberut', 'Sopan', 'Licik', 'Ceria', 'Nakal', 'Sigap', 'Pahit', 'Buas', 'Dingin'],
  NOUN: ['Taring', 'Duri', 'Sengat', 'Bisikan', 'Janji', 'Penggigit', 'Penggelitik', 'Dug', 'Siku', 'Kedip', 'Cegukan',
    'Cakar'],
  ROOT: ['Geram', 'Senja', 'Badai', 'Beku', 'Abu', 'Darah', 'Malam', 'Fajar', 'Remang', 'Bintang', 'Tulang', 'Bara',
    'Gagak', 'Duri', 'Serigala', 'Rongga', 'Besi', 'Bencana', 'Surya', 'Hampa', 'Goblin', 'Beruang', 'Kodok', 'Ngengat',
    'Gerutu'],
  TAIL: ['Gigi', 'Musibah', 'Gigit', 'Cap', 'Tepi', 'Perampok', 'Kapak', 'Duri', 'Lagu', 'Jatuh', 'Serpih', 'Pemanggil',
    'Pengoyak', 'Pembelah', 'Bisikan', 'Sengat', 'Penggigit', 'Pengedug', 'Pelahap', 'Pengganggu', 'Penggelitik'],
  TITLE: ['yang Berani', 'yang Gelisah', 'yang Sabar', 'yang Geram', 'yang Bersemangat', 'yang Terkilap',
    'yang Terkutuk Ringan', 'yang Cukup Ditakuti', 'yang Baik Hati', 'yang Tak Disangka Berat', 'yang Kedua Terbaik',
    'yang Belum Dicuci'],
  EPITHET: ['Sumpah Terakhir', 'yang Tak Terpatahkan', 'Penjaga Kedalaman', 'yang Lapar', 'Pembunuh Raja', 'Jantung Abu',
    'Penghancur Gerbang', 'Lentera', 'Pemakan Bekal', 'Musibah Lutut', 'Bencana Hari Selasa', 'yang Dihantu Sedikit',
    'yang Bersenandung dalam Gelap'],
  IMPOSSIBLE: ['yang Tak Seharusnya Ada', 'yang Tak Terjelaskan', 'Penentang Berhitung', 'Penyesalan Fisika',
    'Penghancur Aturan', 'Paradoks', 'Jam Kesembilan', 'yang Tak Pernah Ditempa'],
  OLD: ['Maha', 'Kuno ', 'Pertama ', 'Purba ', 'Mega-'],
  OMG: ['Musibah Para Raja', 'yang Ada Sebelum Segalanya', 'Akar Dunia', 'Mata Jurang', 'Terakhir dari Tempa Pertama',
    'Bintang yang Tidur', 'Ibu Segala Hal Tajam', 'Pengakhir Pertengkaran', 'Sang Raksasa Sejati'],
  ARMOR_NOUN: ['Tempurung', 'Pelukan', 'Ember', 'Selimut', 'Tembok', 'Janji', 'Tutup', 'Rebahan', 'Dekapan', 'Kulit',
    'Perlindungan', 'Siku'],
  ARMOR_TAIL: ['Penjaga', 'Pelindung', 'Tempurung', 'Kulit', 'Jubah', 'Tembok', 'Benteng', 'Selubung', 'Kubu', 'Penutup',
    'Pemeluk', 'Gumpal', 'Ember', 'Selimut'],
  ARMOR_OMG: ['Ibu Segala Tutup', 'yang Tak Bergeming', 'Tembok Dunia', 'yang Tak Pernah Penyok', 'Terakhir dari Tempa Pertama',
    'Gunung yang Tidur', 'Pengakhir Pertengkaran', 'Sang Raksasa Sejati'],
};

const word = ([list, i]) => words[list][i];
const SEP = { remarkable: ' ', fabled: ', ', impossible: ', ', omg: ', ' };

// the name from its words (core/gear/names.js wordsOf: { rarity, parts }), the base's noun ({ word })
// and the enchantment's adjective (already Indonesian, or null). The head first, its words after.
function say({ rarity, parts }, base, enchant) {
  let core;
  if (!parts.length) core = base.word;
  else if (parts.length === 1) core = `${base.word} ${word(parts[0])}`;
  else if (rarity === 'decent') core = `${word(parts[1])} ${word(parts[0])}`;
  else {
    const old = parts[0][0] === 'OLD' ? word(parts[0]) : '', rest = old ? parts.slice(1) : parts;
    core = old + word(rest[0]) + word(rest[1]);
    if (rest[2]) core += SEP[rarity] + word(rest[2]);
  }
  return enchant ? `${core} ${enchant}` : core;
}

export const names = { words, say, adjective: stem => stem };
