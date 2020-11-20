(async () => {

let q = window.location.search;
const FORMAT = (q.indexOf('disqus') > -1 ? 'Disqus' : (q.indexOf('discord') > -1 ? 'Discord' : (q.indexOf('forum') > -1 ? 'Forum' : 'NONE')))
q = undefined;

const FORMAT_DICT = {
  'Forum': {
    start: '[spoiler="report"]\n',
    end: '[/spoiler]',
    bold_s: '[b]',
    bold_e: '[/b]',
    head_s: '[color=#026526][b][u]',
    head_e: '[/u][/b][/color]'
  },
  'Disqus': {
    start: '<blockquote><code>',
    end: '</code></blockquote>',
    bold_s: '<b>',
    bold_e: '</b>',
    head_s: '</code><u><b>',
    head_e: '</b></u><code>'
  },
  'Discord': {
    start: '```yaml\n',
    end: '```',
    bold_s: '',
    bold_e: '',
    head_s: '#',
    head_e: ''
  }
};

const LANGUAGE_DICT = {
  'cs_cz': 'cze_cz',
  'da_dk': 'dan_dk',
  'de_de': 'ger_de',
  'en_us': 'eng_us',
  'es_es': 'spa_es',
  'fi_fi': 'fin_fi',
  'fr_fr': 'fre_fr',
  'it_it': 'ita_it',
  'ja_jp': 'jpn_jp',
  'ko_kr': 'kor_kr',
  'nl_nl': 'dut_nl',
  'no_no': 'nor_no',
  'pl_pl': 'pol_pl',
  'pt_br': 'por_br',
  'ru_ru': 'rus_ru',
  'sv_se': 'swe_se',
  'zh_cn': 'chs_cn',
  'zh_tw': 'cht_cn'
};

const randomLetters = () => Math.random().toString(36).replace(/[^a-z]+/g, '');

const addInfo = (info, name, value, list) => {
  if(typeof list == 'undefined')
    list = false;

  if(Array.isArray(value)) {
    value = value.join(list ? '\n' : ', ');
  }
  
  if(typeof value == 'string') {
    if(value != null)
      info.push([name, value, list]);
  }
}

const rawReport = (info, f) => {
  let report = f.start;

  for(let [name, value, list] of info) {
    if(list)
      report += f.head_s + name + ':' + f.head_e + '\n' + value + '\n';
    else
      report += name + ': ' + f.bold_s + value + f.bold_e + '\n';
  }

  return report + f.end;
};

// generate reports for all formats
const generateReports = (info) => {
  for(let formatName of Object.keys(FORMAT_DICT)) {
    let f = FORMAT_DICT[formatName], report = rawReport(info, f),
        $card = $('.template > .card').clone();

    $card.find('textarea').val(report)
    $card.find('button')
      .attr('data-target', `#c-${formatName}`)
      .html(formatName);
    $card.find('.collapse')
      .attr('id', `c-${formatName}`)
      .collapse((formatName == FORMAT ? 'show' : 'hide'));

    $('#report').append($card);
  }
  $('#report').show();
};

const alwaysHash = path => (
  path.match(/\/bin(?:_le)?\/ts4(?:_x64)?\.exe?/) !== null
  // path.endsWith('.exe') && path.indexOf('/bin/ts4') > -1
);

// calculate missing hashes and return simplified object
const calculateHashes = async (filesInfo, quickScan) => {
  let hashes = {}, processedSize = 0, totalSize = 0, toCalculate = [];

  $('#hashing').show();

  for(let path of Object.keys(filesInfo)) {
    let fileInfo = filesInfo[path];

    if(typeof fileInfo.hash == 'undefined') {
      if(quickScan && !alwaysHash(path))
        hashes[path] = null;
      else {
        toCalculate.push(path);
        totalSize += fileInfo.file.size;
      }
    }
    else
      hashes[path] = fileInfo.hash;
  }
  for(let path of toCalculate) {
    let fileInfo = filesInfo[path];

    hashes[path] = await calculateMD5(fileInfo.file);
    processedSize += fileInfo.file.size;

    let progress = prog2percent(processedSize / totalSize);
    $('#total-progress')
      .css('width', progress)
      .html(progress);
  }

  $('#hashing').hide();

  return hashes;
};

const addGameCrackedHashes = (source, destination) => {
  for(let key of Object.keys(source)) {
    if(key.startsWith('game/'))
      destination[key.replace('game/', 'game-cracked/')] = source[key];
  }
};

const updateDict = (source, destination) => {
  for(let key of Object.keys(source)) {
    destination[key] = source[key];
  }
};

const getHashes = async (version, legit) => {
  let response = await fetch(`${GITHUB_URL}hashes/${version}.json?${randomLetters()}=${randomLetters()}`);

  if(!response.ok) {
    alert(`hashes for version ${version} not found on server`);
    throw 'hashes not found';
  }

  let hashes = await response.json(), crack, newFormat = false;

  // new format: {"crack": {...}, "hashes": {...}}
  if(typeof hashes.hashes == 'object') {
    ({hashes, crack} = hashes);
    newFormat = true;
  }
  // if legit, set hashes of Game-cracked to the same as for Game
  if(legit)
    addGameCrackedHashes(hashes, hashes);
  // if it's new format, add crack hashes to Game or Game-cracked (when legit)
  if(newFormat)
    (legit ? addGameCrackedHashes : updateDict)(crack, hashes);

  return hashes;
};

const olderThan = (ver1, ver2) => {
  try {
    const parts1 = ver1.split('.'), parts2 = ver2.split('.');
    for(let i=0; i<3; ++i) {
      let part1 = Number(parts1[i]), part2 = Number(parts2[i]);
      if(part1 < part2)
        return true;
      if(part1 > part2)
        return false;
    }
  }
  catch (ignore) {}

  return false;
};

// if there are only language files or none at all, mark as not installed
// instead of listing all files under unknown files
const detectMissingDLCs = (missing, paths, info, version) => {
  let folders = new Set();
  for(let path of missing) {
    folders.add(path.split('/', 1)[0]);
  }
  
  for(let folder of folders) {
    if(folder.match(/^(?:[segf]p\d{2}|delta_le)$/) === null)
      folders.delete(folder);
  }

  if(folders.size > 0) {
    for(let path of paths) {
      let pathParts = path.split('/'), folder = pathParts[0],
          file = pathParts[pathParts.length - 1];
      if(!folders.has(folder) || file.startsWith('strings_'))
        continue;

      folders.delete(folder);
    }
  }

  let pattern = new RegExp('^(' + Array.from(folders).join('|') + ')/'),
      should_filter = folders.size > 0;

  if(!olderThan(version, '1.58.63')) {
    addInfo(info, 'Legacy Edition', (folders.has('delta_le') ? 'not ' : '') + 'installed');
    folders.delete('delta_le');
  }

  if(folders.size > 0)
    addInfo(
      info, 'DLCs not installed',
      Array.from(folders).map(x => x.toUpperCase()).sort()
    );

  if(should_filter)
    return missing.filter(x => x.match(pattern) === null);
  else
    return missing;
};

// validate game files
const validate = async (version, filesInfo, info, quickScan, legit, ignoredLanguages) => {
  let missing = [], unknown = [], mismatch = [], dlcFiles = {},
      serverHashes = await getHashes(version, legit);

  for(let path of Object.keys(filesInfo)) {
    if(typeof serverHashes[path] == 'undefined') {
      unknown.push(path);
      delete filesInfo[path];
    }
  }

  if(quickScan)
    mismatch.push('--- quick scan ---');

  let userHashes = await calculateHashes(filesInfo, quickScan);

  for(let path of Object.keys(userHashes)) {
    let hash = userHashes[path];
    if(hash !== null && hash !== serverHashes[path])
      mismatch.push(path);
    delete serverHashes[path];
  }

  missing = Object.keys(serverHashes);
  if(ignoredLanguages.length > 0) {
    let pattern = new RegExp('strings_(' + ignoredLanguages.join('|') + ').package$');
    missing = missing.filter(x => x.match(pattern) === null);
  }
  missing = detectMissingDLCs(missing, Object.keys(userHashes), info, version);

  addInfo(info, 'Hash mismatch', mismatch.sort(), true);
  addInfo(info, 'Missing files', missing.sort(), true);
  addInfo(info, 'Unknown files', unknown.sort(), true);
  generateReports(info);
};

// read file (blob) as text or array buffer asynchronously
const readAs = (file, type) => new Promise(resolve => {
  let reader = new FileReader();
  reader.onload = e => {
    resolve(e.target.result);
  };
  if(type == 'text')
    reader.readAsText(file);
  else
    reader.readAsArrayBuffer(file);
});

const prog2percent = prog => Math.min(100, 100 * prog).toFixed() + '%';

const calculateMD5 = async file => {
  let md5 = CryptoJS.algo.MD5.create();

  $('#hashing-name').html(file.webkitRelativePath);
  for(let size=file.size, chunkSize = 2*1024*1024, offset=0; offset<size; offset+=chunkSize) {
    let progress = prog2percent(offset / size);
    $('#hashing-progress')
      .css('width', progress)
      .html(progress);
    let fileSlice = file.slice(offset, offset + chunkSize),
        chunk = await readAs(fileSlice, 'arraybuffer'),
        wordArray = CryptoJS.lib.WordArray.create(chunk);
    md5.update(wordArray);
  }
  $('#hashing-progress').css('width', '100%').html('100%');

  let hash = md5.finalize();
  return hash.toString(CryptoJS.enc.Hex).toLowerCase();
};

// add hashes from .md5 file to `filesInfo`
const processMD5 = async (file, info) => {
  let text = await readAs(file, 'text'),
      lines = text.split(/[\r\n]+/);

  for(let line of lines) {
    let matches = line.match(/^(.{32})\s\*(.*)$/);
    if(matches) {
      let [_, hash, path] = matches,
          pathElems = path.toLowerCase().split(/\\|\//);
      pathElems.shift();
      path = pathElems.join('/');

      try {
        info[path].hash = hash.toLowerCase();
      }
      catch(ignore) {}
    }
  }
};

const getVersionFromFile = async (file, regexp) => {
  let contents = await readAs(file, 'text'),
    matches = contents.match(regexp);
  if(matches)
    return matches[1];
  else
    return null;
};

// get version from default.ini
const getGameVersion = async file => {
  return await getVersionFromFile(file, /^\s*gameversion\s*=\s*([\d\.]+)\s*$/m)
};

// get version from codex.cfg
const getCODEXCrackVersion = async file => {
  return await getVersionFromFile(file, /^\s*"Version"\s+"([\d\.]+)"\s*$/m)
};

const getVersion = async (filesInfo, info) => {
  let tmp, legit = false, wrongDir = true,
      gameVersion = gameCrackedVersion = crackVersion = null;

  tmp = filesInfo['game/bin/default.ini'];
  if(typeof tmp !== 'undefined') {
    gameVersion = await getGameVersion(tmp.file);
    wrongDir = false;
  }
  tmp = filesInfo['game-cracked/bin/default.ini'];
  if(typeof tmp !== 'undefined') {
    gameCrackedVersion = await getGameVersion(tmp.file);
    wrongDir = false;
    legit = true;
  }
  else if(typeof filesInfo['game-cracked/bin/ts4_x64.exe'] !== 'undefined') {
    wrongDir = false;
    legit = true;
  }
  tmp = filesInfo['game' + (legit ? '-cracked' : '') + '/bin/codex.cfg'];
  if(typeof tmp !== 'undefined') {
    crackVersion = await getCODEXCrackVersion(tmp.file);
    wrongDir = false;
  }

  addInfo(info, 'Game version', gameVersion);
  if(legit)
    addInfo(info, 'Game-cracked version', gameCrackedVersion || 'not detected');
  addInfo(info, 'Crack version', crackVersion);

  return [gameVersion || gameCrackedVersion || crackVersion, legit, wrongDir];
};

// check if file can be ignored - additional files added by repackers, etc.
const canBeIgnored = path => (
  // G4TW's files
  // path.startsWith('#') ||
  // can play without it
  path.startsWith('soundtrack/') ||
  path.startsWith('support/') ||
  // my tools
  path == 'language-changer.exe' ||
  path == 'dlc-toggler.exe' ||
  path == 'dlc-uninstaller.exe' ||
  path == 'dlc.ini' ||
  // from MAC
  path.endsWith('/.ds_store') //||
  // safe to ignore, they should not be there but don't affect the game
  // path.endsWith('.rar') ||
  // path.endsWith('.bak') ||
  // path.endsWith('.lnk') ||
  // path.endsWith('.tmp')
);

// filter files from selected folder and detect game languages
const filterAndDetectLang = files => {
  let info = {}, langs = [];

  for(let file of files) {
    let pathElems = file.webkitRelativePath.split(/\\|\//);
    pathElems.shift();
    let path = pathElems.join('/').toLowerCase();

    if(path.startsWith('__installer/')) {
      let matches = path.match('__installer/gdfbinary_([a-z]{2}_[a-z]{2}).dll');
      if(matches) {
        let lang = matches[1];
        if(typeof LANGUAGE_DICT[lang] != 'undefined')
          langs.push(lang);
      }
      continue;
    }
    else if(canBeIgnored(path))
      continue;

    info[path] = {file: file};
  }

  return [info, langs];
};

const detectLanguages = filesInfo => {
  const langPerFolder = {};
  const allLangCount = Object.values(LANGUAGE_DICT).length;
  const re = new RegExp(
    '^(data/client|delta/(?:[egs]p[0-9]{2}))/strings_('
    + Object.values(LANGUAGE_DICT).join('|')
    + ')\.package$');
  for(let path of Object.keys(filesInfo)) {
    let m = path.match(re);
    if(m) {
      try {
        langPerFolder[m[1]].add(m[2]);
      }
      catch(e) {
        if(e instanceof TypeError) {
          langPerFolder[m[1]] = new Set([m[2]]);
        }
        else
          throw e;
      }
    }
  }

  const languagesSet = new Set();
  for(let langs of Object.values(langPerFolder)) {
    if(langs.size === allLangCount)
      continue;
    langs.forEach(languagesSet.add, languagesSet);
  }
  const reversedLangDict = Object.entries(LANGUAGE_DICT).reduce((ret, entry) => {
    const [key, value] = entry;
    ret[value] = key;
    return ret;
  }, {});

  const languages = [];
  for(let lang of languagesSet) {
    languages.push(reversedLangDict[lang]);
  }
  return languages;
};

// prepare and process info
const initialProcessing = async e => {
  let info = [], folderName, files = e.target.files,
      md5File = $('#md5-picker')[0].files[0],
      quickScan = $('#quick-scan').prop('checked');

  if(files.length > 0)
    folderName = files[0].webkitRelativePath.split(/\\|\//, 1)[0];
  else {
    alert('No files found in selected directory.');
    return;
  }

  let [filesInfo, languages] = filterAndDetectLang(files),
      [version, legit, wrongDir] = await getVersion(filesInfo, info),
      ignoredLanguages = [];

  if(version === null) {
    if(
        wrongDir &&
        typeof filesInfo['data/simulation/simulationfullbuild0.package'] == 'undefined' &&
        typeof filesInfo['data/simulation/simulationdeltabuild0.package'] == 'undefined') {
      alert('Could not detect game version. Wrong directory selected.');
      return;
    }
    else {
      version = prompt('Could not detect game version. Enter manually (eg. 1.46.18.1020)');
      if(version === null || version.match(/^\d+\.\d+\.\d+\.\d+$/) === null) {
        alert('Incorrect game version.');
        return;
      }
    }
  }

  // Simplified Chinese was added in 1.60.54, remove it for older versions
  if(olderThan(version, '1.60.54')) {
    delete LANGUAGE_DICT['zh_cn'];
  }

  // starting from 1.68.154 there are no GDFBinary*.dll files, lang detection is different
  if(!olderThan(version, '1.68.154')) {
    languages = detectLanguages(filesInfo);
  }

  if(languages.length == 0 || languages.length == Object.keys(LANGUAGE_DICT).length)
    languages = null;
  else
    for(let lang of Object.keys(LANGUAGE_DICT)) {
      if(languages.indexOf(lang) == -1)
        ignoredLanguages.push(LANGUAGE_DICT[lang]);
    }

  $('#user-input').hide();

  if(typeof md5File !== 'undefined')
    await processMD5(md5File, filesInfo);

  addInfo(info, 'Folder', folderName);
  addInfo(info, 'Languages', languages);

  validate(version, filesInfo, info, quickScan, legit, ignoredLanguages);
};

await addJS('https://cdnjs.cloudflare.com/ajax/libs/crypto-js/3.1.9-1/core.min.js', 'sha384-j/yjQ26lM3oABUyp5sUcxbbLK/ECT6M4bige54dRtJcbhk+j6M8GAt+ZJYPK3q/l')
await Promise.all([
  addJS('https://cdnjs.cloudflare.com/ajax/libs/crypto-js/3.1.9-1/md5.min.js', 'sha384-FvUg0oOjwQ1uec6J22LkHkEihYZfQYU5BaPKoUpt5OUVr7+CKyX2o5NC/fOqFGih'),
  addJS('https://cdnjs.cloudflare.com/ajax/libs/crypto-js/3.1.9-1/lib-typedarrays.min.js', 'sha384-ntzxweGwO+bdybZB6NfRCrCbK1X5djqon4rquDPIQFe1jBTZ5KZ1qnoTZCup5Nwh')
]);

$('#user-input').append(`  <div class="form-check">
    <input class="form-check-input" type="checkbox" id="quick-scan">
    <label class="form-check-label" for="quick-scan">Quick scan (shows only missing and unknown files)</label>
  </div>
  <div class="form-group">
    <label for="md5-picker">Select .md5 file (optional)</label>
    <input type="file" class="form-control-file" id="md5-picker" accept=".md5">
  </div>
  <div class="form-group">
    <label for="directory-picker">Select your The Sims 4 installation directory (the one with "Data", "Delta", "Game" and other folders inside)</label>
    <input type="file" class="form-control-file" id="directory-picker" webkitdirectory directory>
  </div>`);
$('#report').after(`<div class="template" style="display: none">
  <div class="card">
    <div class="card-header">
      <button class="btn btn-link" type="button" data-toggle="collapse"></button>
    </div>
    <div class="collapse" data-parent="#report">
      <textarea class="form-control" rows="15"></textarea>
    </div>
  </div>
</div>`);

$('#quick-scan').on('change', e => {
  if($(e.target).prop('checked')) {
    $('#md5-picker').prop('disabled', 'disabled');
    $('#md5info').hide();
  }
  else {
    $('#md5-picker').prop('disabled', '');
    $('#md5info').show();
  }
});

$('#quick-scan').click();

$('#directory-picker').on('change', async e => {
  try {
    await initialProcessing(e);
  }
  catch(err) {
    alert('Some error occured, try using Firefox or Chrome.\n\n' + err);
  }
});

$('#report').on('copy', e => {
  e.originalEvent.clipboardData.setData('text/plain', e.target.value);
  e.preventDefault();
});

})();