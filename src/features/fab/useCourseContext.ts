import { useState, useEffect } from 'react';

export interface CourseInfo {
  id: string;
  title: string;
  url: string;
  image?: string;
  instructor?: string;
  addedAt: number;
}

function getCourseInfo(): CourseInfo | null {
  const url = window.location.href;
  const pathname = window.location.pathname;
  
  const courseMatch = pathname.match(/\/course\/([^/?]+)/);
  if (!courseMatch) {
    return null;
  }
  
  const courseId = courseMatch[1];
  
  let courseTitle = '';
  const titleEl = document.querySelector(
    '[data-purpose="course-title"], h1.ud-heading-xl, h1.clp-lead__title, .ud-heading-xxl'
  );
  if (titleEl) {
    courseTitle = titleEl.textContent?.trim() || '';
  }
  if (!courseTitle) {
    courseTitle = document.title
      .replace(' | Udemy Business', '')
      .replace(' | Udemy', '')
      .trim();
  }
  
  let courseImage = '';
  const imgSelectors = [
    '[data-purpose="course-image"] img',
    '.intro-asset--img-aspect--1UbeZ img',
    '.course-image img',
    'img[src*="img-c.udemycdn.com/course"]',
    'img[src*="udemycdn.com/course"]',
  ];
  for (const selector of imgSelectors) {
    const imgEl = document.querySelector(selector) as HTMLImageElement | null;
    if (imgEl && imgEl.src) {
      courseImage = imgEl.src;
      break;
    }
  }
  
  if (!courseImage) {
    const allImages = document.querySelectorAll('img[src*="udemycdn.com"]');
    for (const img of Array.from(allImages) as HTMLImageElement[]) {
      if (
        img.src.includes('/course/') &&
        !img.src.includes('icon') &&
        !img.src.includes('avatar')
      ) {
        courseImage = img.src;
        break;
      }
    }
  }
  
  let instructor = '';
  const instructorEl = document.querySelector(
    '[data-purpose="instructor-name-top"], .ud-instructor-links a, .instructor-links a'
  );
  if (instructorEl) {
    instructor = instructorEl.textContent?.trim() || '';
  }
  
  let fallbackId = courseId;
  if (!fallbackId) {
    try {
      fallbackId = btoa(url).slice(0, 20);
    } catch {
      fallbackId = 'unknown';
    }
  }

  return {
    id: fallbackId,
    title: courseTitle || 'Unknown Course',
    image: courseImage || undefined,
    url: url,
    instructor: instructor || undefined,
    addedAt: Date.now(),
  };
}

export function useCourseContext(): CourseInfo | null {
  const [courseInfo, setCourseInfo] = useState<CourseInfo | null>(null);

  useEffect(() => {
    // Initial check
    setCourseInfo(getCourseInfo());

    const update = () => {
      setCourseInfo(getCourseInfo());
    };

    window.addEventListener('popstate', update);
    
    const observer = new MutationObserver(update);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      window.removeEventListener('popstate', update);
      observer.disconnect();
    };
  }, []);

  return courseInfo;
}
