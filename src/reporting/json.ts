import { AnalysisResult } from '../types';

export function formatJson(result: AnalysisResult): string {
  return JSON.stringify(result, null, 2);
}
