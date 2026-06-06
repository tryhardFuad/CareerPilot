const SECTION_KEYWORDS = [
  'EXPERIENCE', 'WORK EXPERIENCE', 'EDUCATION', 'SKILLS',
  'TECHNICAL SKILLS', 'PROJECTS', 'SUMMARY', 'OBJECTIVE',
  'CERTIFICATIONS', 'AWARDS', 'PUBLICATIONS', 'LANGUAGES',
  'HACKATHON EXPERIENCE', 'ACHIEVEMENTS', 'INTERNSHIP',
]

const SECTION_MAP: Record<string, string> = {
  'EXPERIENCE': 'experience',
  'WORK EXPERIENCE': 'work_experience',
  'HACKATHON EXPERIENCE': 'experience',
  'INTERNSHIP': 'experience',
  'EDUCATION': 'education',
  'SKILLS': 'skills',
  'TECHNICAL SKILLS': 'technical_skills',
  'PROJECTS': 'projects',
  'SUMMARY': 'summary',
  'OBJECTIVE': 'objective',
  'CERTIFICATIONS': 'certifications',
  'AWARDS': 'awards',
  'ACHIEVEMENTS': 'awards',
  'PUBLICATIONS': 'publications',
  'LANGUAGES': 'skills',
}

export interface CvChunk {
  section: string
  text: string
}

export function chunkCv(rawText: string): CvChunk[] {
  // Insert a newline before any known section keyword found inline
  let processed = rawText
  for (const keyword of SECTION_KEYWORDS) {
    const regex = new RegExp(`(?<![\\n])\\b(${keyword})\\b`, 'gi')
    processed = processed.replace(regex, `\n$1`)
  }

  const lines = processed.split('\n')
  const chunks: CvChunk[] = []
  let currentSection = 'summary'
  let buffer: string[] = []

  for (const line of lines) {
    const trimmed = line.trim().toUpperCase()
    const matched = SECTION_KEYWORDS.find(k => trimmed === k || trimmed.startsWith(k + ' ') || trimmed.startsWith(k + ':'))

    if (matched) {
      if (buffer.length > 0) {
        chunks.push({ section: currentSection, text: buffer.join('\n').trim() })
        buffer = []
      }
      currentSection = SECTION_MAP[matched.toUpperCase()] ?? 'other'
    } else {
      buffer.push(line)
    }
  }

  if (buffer.length > 0) {
    chunks.push({ section: currentSection, text: buffer.join('\n').trim() })
  }

  return chunks.filter(c => c.text.length > 30)
}
