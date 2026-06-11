export function getCourseSaveErrorMessage(error: any): string {
  const missingTokenMessage = 'Udemy access token not found. Refresh/login to Udemy and try again.';
  if (error?.message === missingTokenMessage) {
    return missingTokenMessage;
  }

  const statusFromMessage = String(error?.message || '').match(/\bHTTP\s+(\d{3})\b/);
  const status = Number(error?.status || statusFromMessage?.[1] || 0);

  if (status === 401) {
    return 'Udemy session expired. Refresh/login to Udemy and try again.';
  }
  if (status === 404) {
    return 'Udemy course not found or unavailable.';
  }
  if (status === 429) {
    return 'Udemy rate limit hit. Try again later.';
  }
  if (status === 502 || status === 503 || status === 504) {
    return 'Udemy metadata service unavailable. Try again later.';
  }

  return 'Failed to save course. Please try again.';
}
