import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCourseContext } from '../useCourseContext';

describe('useCourseContext', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.stubGlobal('location', {
      href: 'https://www.udemy.com/',
      pathname: '/',
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should return null when not on a course page', () => {
    const { result } = renderHook(() => useCourseContext());
    expect(result.current).toBeNull();
  });

  it('should scrape course details on a course page', () => {
    vi.stubGlobal('location', {
      href: 'https://www.udemy.com/course/test-course/',
      pathname: '/course/test-course/',
    });

    document.body.innerHTML = `
      <h1 class="clp-lead__title" data-purpose="course-title">My Test Course</h1>
      <div data-purpose="course-image">
        <img src="https://img-c.udemycdn.com/course/240x135/123_abc.jpg" />
      </div>
      <div data-purpose="instructor-name-top">
        John Doe
      </div>
    `;

    const { result } = renderHook(() => useCourseContext());
    expect(result.current).not.toBeNull();
    expect(result.current?.id).toBe('test-course');
    expect(result.current?.title).toBe('My Test Course');
    expect(result.current?.image).toBe('https://img-c.udemycdn.com/course/240x135/123_abc.jpg');
    expect(result.current?.instructor).toBe('John Doe');
    expect(result.current?.url).toBe('https://www.udemy.com/course/test-course/');
  });

  it('should update context on DOM mutation', async () => {
    vi.stubGlobal('location', {
      href: 'https://www.udemy.com/course/test-course/',
      pathname: '/course/test-course/',
    });

    const { result } = renderHook(() => useCourseContext());
    expect(result.current?.title).toBe('Unknown Course');

    await act(async () => {
      const titleEl = document.createElement('h1');
      titleEl.setAttribute('data-purpose', 'course-title');
      titleEl.textContent = 'Dynamic Title';
      document.body.appendChild(titleEl);
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(result.current?.title).toBe('Dynamic Title');
  });

  it('should update context on popstate (SPA navigation)', async () => {
    vi.stubGlobal('location', {
      href: 'https://www.udemy.com/course/first-course/',
      pathname: '/course/first-course/',
    });

    const { result } = renderHook(() => useCourseContext());
    expect(result.current?.id).toBe('first-course');

    await act(async () => {
      vi.stubGlobal('location', {
        href: 'https://www.udemy.com/course/second-course/',
        pathname: '/course/second-course/',
      });
      window.dispatchEvent(new PopStateEvent('popstate'));
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(result.current?.id).toBe('second-course');
  });
});
