/** "texto <b>negrita</b> texto" → el mismo texto con <strong>; la traducción decide qué va en negrita */
import React from 'react';

export function withBold(text: string): React.ReactNode[] {
    return text.split(/<b>(.*?)<\/b>/).map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part));
}
