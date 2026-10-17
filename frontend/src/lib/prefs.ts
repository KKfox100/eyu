/** 本地偏好（不跨设备，够用且不用改表） */

const PRACTICE_KEY = 'eyu.practice';

/** 复习时是否使用练习题（完形填空 / 语序重组），默认开启 */
export function readPracticePref(): boolean {
  try {
    const raw = localStorage.getItem(PRACTICE_KEY);
    return raw === null ? true : raw === '1';
  } catch {
    return true;
  }
}

export function writePracticePref(enabled: boolean): void {
  try {
    localStorage.setItem(PRACTICE_KEY, enabled ? '1' : '0');
  } catch {
    /* 隐私模式下忽略 */
  }
}
