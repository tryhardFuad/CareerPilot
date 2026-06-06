const SECTION_KEYWORDS: { pattern: RegExp; section: string }[] = [
  { pattern: /^professional experience/i, section: 'experience' },
  { pattern: /^work experience/i, section: 'work_experience' },
  { pattern: /^research experience/i, section: 'experience' },
  { pattern: /^teaching experience/i, section: 'experience' },
  { pattern: /^internship/i, section: 'experience' },
  { pattern: /^education/i, section: 'education' },
  { pattern: /^skills/i, section: 'technical_skills' },
  { pattern: /^technical skills/i, section: 'technical_skills' },
  { pattern: /^projects/i, section: 'projects' },
  { pattern: /^publications/i, section: 'publications' },
  { pattern: /^patents/i, section: 'publications' },
  { pattern: /^publications and patents/i, section: 'publications' },
  { pattern: /^scholastic achievements/i, section: 'awards' },
  { pattern: /^achievements/i, section: 'awards' },
  { pattern: /^awards/i, section: 'awards' },
  { pattern: /^certifications/i, section: 'certifications' },
  { pattern: /^positions of responsibility/i, section: 'other' },
  { pattern: /^extra curricular/i, section: 'other' },
  { pattern: /^courses/i, section: 'other' },
  { pattern: /^summary/i, section: 'summary' },
  { pattern: /^objective/i, section: 'objective' },
  { pattern: /^languages/i, section: 'technical_skills' },
]

export interface CvChunk {
  section: string
  text: string
}

export function chunkCv(rawText: string): CvChunk[] {
  const lines = rawText.split('\n')
  const chunks: CvChunk[] = []
  let currentSection = 'summary'
  let buffer: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    const matched = SECTION_KEYWORDS.find(k => k.pattern.test(trimmed))

    if (matched && trimmed.length < 60) {
      if (buffer.length > 0) {
        chunks.push({ section: currentSection, text: buffer.join('\n').trim() })
        buffer = []
      }
      currentSection = matched.section
    } else {
      buffer.push(line)
    }
  }

  if (buffer.length > 0) {
    chunks.push({ section: currentSection, text: buffer.join('\n').trim() })
  }

  return chunks.filter(c => c.text.length > 30)
}
