/** A message as a banner reads it: the first sentence is the title, whatever follows is the body. */
export function lead(text: string): [title: string, body: string] {
  // A Latin full stop ends the title when a space follows it; a Chinese one (。！？) needs none.
  const m = /^(.*?(?:[.!?](?=\s)|[。！？]))\s*(\S.*)$/s.exec(text.trim());
  return m ? [m[1]!, m[2]!] : [text.trim(), ""];
}
