import type { GradeSystem } from '../types'

export const GRADE_SYSTEMS: Record<GradeSystem, { label: string; grades: string[] }> = {
  french: {
    label: 'Francuska',
    grades: [
      '3', '4a', '4b', '4c',
      '5a', '5b', '5c',
      '6a', '6a+', '6b', '6b+', '6c', '6c+',
      '7a', '7a+', '7b', '7b+', '7c', '7c+',
      '8a', '8a+', '8b', '8b+', '8c', '8c+',
      '9a', '9a+', '9b', '9b+', '9c',
    ],
  },
  uiaa: {
    label: 'UIAA',
    grades: [
      'I', 'II', 'III', 'IV', 'V', 'VI', 'VI+',
      'VII-', 'VII', 'VII+',
      'VIII-', 'VIII', 'VIII+',
      'IX-', 'IX', 'IX+',
      'X-', 'X', 'X+',
      'XI-', 'XI', 'XI+',
    ],
  },
  kurtyka: {
    label: 'Kurtyki',
    grades: [
      'I', 'II', 'III', 'IV', 'V', 'V+', 'VI',
      'VI.1', 'VI.1+', 'VI.2', 'VI.2+',
      'VI.3', 'VI.3+', 'VI.4', 'VI.4+',
      'VI.5', 'VI.5+', 'VI.6', 'VI.6+', 'VI.7', 'VI.7+',
    ],
  },
}
