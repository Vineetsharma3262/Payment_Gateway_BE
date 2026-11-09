/**
 * PayCo issues its own public identifiers (`ord_…`, `pay_…`). Provider identifiers
 * are stored only in internal mappings and never returned by the public API.
 */
export type IdPrefix =
  | 'ord'
  | 'pay'
  | 'rfnd'
  | 'plink'
  | 'mer'
  | 'key'
  | 'evt'
  | 'whep'
  | 'stl'
  | 'rcp'
  | 'pout'
  | 'usr'
  | 'aud'
  | 'idem'
  | 'map'
  | 'ses'
  | 'fam'
  | 'prt'
  | 'mem'
  | 'inv'
  | 'onb'
  | 'own'
  | 'doc'
  | 'mpa'
  | 'log'
  | 'cus'
  | 'jtx'
  | 'jen'
  | 'fee'
  | 'fsch'
  | 'rec'
  | 'dsp'
  | 'whd'
  | 'in'
  | 'sub'
  | 'pev';

export interface IdGenerator {
  next(prefix: IdPrefix): string;
}

export const ID_GENERATOR = Symbol('IdGenerator');
