import { describe, it, expect } from 'vitest';

/**
 * 案件番号の自動採番ロジックのテスト
 * Projects.tsxのgetNextProjectNumber関数と同等のロジックをテスト
 */

interface ProjectLike {
  project_number: string | null;
}

function getNextProjectNumber(projects: ProjectLike[]): string {
  const existingNumbers = projects
    .map(p => parseInt(p.project_number || '0', 10))
    .filter(n => !isNaN(n) && n > 0);
  const maxNum = existingNumbers.length > 0 ? Math.max(...existingNumbers) : 0;
  return String(maxNum + 1);
}

describe('案件番号自動採番', () => {
  it('案件がない場合は1を返す', () => {
    expect(getNextProjectNumber([])).toBe('1');
  });

  it('既存の案件番号から次の番号を返す', () => {
    const projects: ProjectLike[] = [
      { project_number: '1' },
      { project_number: '2' },
      { project_number: '3' },
    ];
    expect(getNextProjectNumber(projects)).toBe('4');
  });

  it('欠番があっても最大番号+1を返す（番号がずれない）', () => {
    // 案件2が削除された場合でも、次は4になる
    const projects: ProjectLike[] = [
      { project_number: '1' },
      { project_number: '3' },
    ];
    expect(getNextProjectNumber(projects)).toBe('4');
  });

  it('案件番号がnullの案件がある場合はスキップする', () => {
    const projects: ProjectLike[] = [
      { project_number: '5' },
      { project_number: null },
      { project_number: '3' },
    ];
    expect(getNextProjectNumber(projects)).toBe('6');
  });

  it('案件番号が数値でない場合はスキップする', () => {
    const projects: ProjectLike[] = [
      { project_number: '10' },
      { project_number: 'PRJ-001' },
      { project_number: 'abc' },
    ];
    expect(getNextProjectNumber(projects)).toBe('11');
  });

  it('大きな番号の案件が削除されても、残りの最大番号+1を返す', () => {
    // 案件10が削除された場合、次は8+1=9
    const projects: ProjectLike[] = [
      { project_number: '5' },
      { project_number: '8' },
      { project_number: '3' },
    ];
    expect(getNextProjectNumber(projects)).toBe('9');
  });

  it('全ての案件番号がnullの場合は1を返す', () => {
    const projects: ProjectLike[] = [
      { project_number: null },
      { project_number: null },
    ];
    expect(getNextProjectNumber(projects)).toBe('1');
  });

  it('連続していない番号でも最大値+1を正しく返す', () => {
    const projects: ProjectLike[] = [
      { project_number: '1' },
      { project_number: '5' },
      { project_number: '10' },
      { project_number: '15' },
    ];
    expect(getNextProjectNumber(projects)).toBe('16');
  });
});
