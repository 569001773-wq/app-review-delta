import { Rule } from './shared';
import { ARD001 } from './ard001';
import { ARD002 } from './ard002';
import { ARD003 } from './ard003';
import { ARD004 } from './ard004';
import { ARD005 } from './ard005';
import { ARD006 } from './ard006';
import { ARD007 } from './ard007';
import { ARD008 } from './ard008';
import { ARD009 } from './ard009';

export const RULES: Rule[] = [
  ARD001,
  ARD002,
  ARD003,
  ARD004,
  ARD005,
  ARD006,
  ARD007,
  ARD008,
  ARD009,
];

export function ruleById(id: string): Rule | undefined {
  return RULES.find((r) => r.id === id);
}
