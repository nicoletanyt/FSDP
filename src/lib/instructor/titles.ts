// Single source shared with the create-instructor Edge Function.
export {
  INSTRUCTOR_TITLES,
  allowedTitles,
  danNumber,
  instructorTitleLabels,
  isInstructorTitle,
  isTitleAllowed,
  minimumDanForTitle,
  minimumDanLabel,
  titleRequirement,
} from '../../../supabase/functions/_shared/instructor-titles'
export type { AwardedInstructorTitle, InstructorTitle } from '../../../supabase/functions/_shared/instructor-titles'
