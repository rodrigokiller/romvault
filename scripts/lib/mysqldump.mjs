/**
 * Parser minimalista de dump MySQL (mysqldump/phpMyAdmin) em JS puro.
 * Extrai CREATE TABLE (ordem das colunas) e INSERT INTO (linhas -> objetos).
 * Suporta: INSERT multi-row, strings com \' '' \\ \n etc., NULL, numeros,
 * statements quebrados em varias linhas.
 *
 * Uso: const tables = parseMysqlDump(sqlText)
 *      tables.get('hacks') -> { columns: [...], rows: [{col: val, ...}] }
 */

/** Desfaz escapes de string do MySQL. */
function unescapeMysql(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\' && i + 1 < s.length) {
      const n = s[++i];
      out +=
        n === 'n' ? '\n' : n === 'r' ? '\r' : n === 't' ? '\t' :
        n === '0' ? '\0' : n === 'Z' ? '\x1a' : n; // \' \" \\ e outros: literal
    } else if (ch === "'" && s[i + 1] === "'") {
      out += "'";
      i++;
    } else {
      out += ch;
    }
  }
  return out;
}

/** Converte um token de valor cru em JS (null | number | string). */
function convertValue(raw) {
  const v = raw.trim();
  if (v === '' || /^null$/i.test(v)) return null;
  if (v.startsWith("'") && v.endsWith("'")) return unescapeMysql(v.slice(1, -1));
  if (v.startsWith('"') && v.endsWith('"')) return unescapeMysql(v.slice(1, -1));
  if (/^-?\d+$/.test(v)) {
    const n = Number(v);
    return Number.isSafeInteger(n) ? n : v; // ids gigantes ficam string
  }
  if (/^-?\d*\.\d+(e[+-]?\d+)?$/i.test(v)) return Number(v);
  return v; // 0x..., funcoes, etc: cru
}

/**
 * Tokeniza o bloco `(...),(...)` de um INSERT em linhas de valores.
 * Maquina de estados: profundidade de parenteses + aspas + escape.
 */
function parseValueRows(text) {
  const rows = [];
  let row = [];
  let cur = '';
  let depth = 0;
  let quote = null; // "'" ou '"'
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      cur += ch;
      if (ch === '\\') { cur += text[++i] ?? ''; continue; } // escape consome o proximo
      if (ch === quote) {
        if (text[i + 1] === quote) { cur += text[++i]; continue; } // '' escapado
        quote = null;
      }
      continue;
    }
    if (ch === "'" || ch === '"') { quote = ch; cur += ch; continue; }
    if (ch === '(') {
      depth++;
      if (depth === 1) { row = []; cur = ''; continue; }
    } else if (ch === ')') {
      depth--;
      if (depth === 0) { row.push(convertValue(cur)); rows.push(row); cur = ''; continue; }
    } else if (ch === ',' && depth === 1) {
      row.push(convertValue(cur)); cur = ''; continue;
    } else if (ch === ',' && depth === 0) {
      continue; // separador entre rows
    } else if (ch === ';' && depth === 0) {
      break;
    }
    if (depth >= 1) cur += ch;
  }
  return rows;
}

/** Extrai os nomes de coluna de um CREATE TABLE. */
function parseCreateColumns(stmt) {
  const open = stmt.indexOf('(');
  if (open === -1) return [];
  const body = stmt.slice(open + 1);
  const cols = [];
  for (const line of body.split('\n')) {
    const m = line.match(/^\s*`([^`]+)`/);
    if (m) cols.push(m[1]);
  }
  return cols;
}

/**
 * Parseia o texto completo de um dump. Retorna Map<tabela, {columns, rows}>.
 * `onlyTables` (Set) limita o parse (economiza memoria p/ dumps grandes).
 */
export function parseMysqlDump(sqlText, onlyTables = null) {
  const tables = new Map();
  const namesOnly = new Set(); // tabelas puladas (p/ --inspect listar tudo)
  const ensure = (name) => {
    if (!tables.has(name)) tables.set(name, { columns: [], rows: [] });
    return tables.get(name);
  };

  // acumula statements respeitando aspas (um ';' dentro de string nao encerra)
  let stmt = '';
  let quote = null;
  const lines = sqlText.split(/\r?\n/);
  for (const line of lines) {
    // atualiza estado de aspas percorrendo a linha
    let i = 0;
    while (i < line.length) {
      const ch = line[i];
      if (quote) {
        if (ch === '\\') i++;
        else if (ch === quote) quote = null;
      } else if (ch === "'" || ch === '"') quote = ch;
      i++;
    }
    stmt += line + '\n';
    if (!quote && line.trimEnd().endsWith(';')) {
      processStatement(stmt);
      stmt = '';
    }
  }
  if (stmt.trim()) processStatement(stmt);

  function processStatement(raw) {
    // remove linhas de comentario (--, #, /*!...*/) do inicio do statement
    const s = raw.replace(/^(\s*(--[^\n]*|#[^\n]*|\/\*[^\n]*\*\/;?)?\n)+/, '').trimStart();
    // regexes ANCORADAS no statement inteiro (a lista de colunas de um INSERT
    // pode passar de centenas de chars — nada de olhar so um "head" curto).
    let m = s.match(/^CREATE TABLE (?:IF NOT EXISTS )?`?([^`\s(]+)`?/i);
    if (m) {
      const name = m[1];
      if (onlyTables && !onlyTables.has(name)) { namesOnly.add(name); return; }
      ensure(name).columns = parseCreateColumns(s);
      return;
    }
    m = s.match(/^INSERT INTO `?([^`\s(]+)`?\s*(\(([^)]*)\))?\s*VALUES/i);
    if (m) {
      const name = m[1];
      if (onlyTables && !onlyTables.has(name)) { namesOnly.add(name); return; }
      const t = ensure(name);
      const explicitCols = m[3]
        ? m[3].split(',').map((c) => c.trim().replace(/^`|`$/g, ''))
        : null;
      const cols = explicitCols ?? t.columns;
      const rows = parseValueRows(s.slice(m.index + m[0].length));
      for (const r of rows) {
        const obj = {};
        for (let ci = 0; ci < r.length; ci++) obj[cols[ci] ?? `col${ci}`] = r[ci];
        t.rows.push(obj);
      }
    }
  }

  // tabelas puladas entram so com o nome (p/ --inspect listar tudo)
  for (const n of namesOnly) if (!tables.has(n)) tables.set(n, { columns: [], rows: [], skipped: true });

  return tables;
}
