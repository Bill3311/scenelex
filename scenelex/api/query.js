// Vercel Serverless Function
// 环境变量需要在 Vercel 控制台设置：
//   DEEPSEEK_API_KEY = sk-xxxx
//   ACCESS_PASSWORD = 你设定的访问密码

const SYSTEM_PROMPT = `你是一个英语母语者用语教练。用户查询任何英语单词、短语或中文词，你返回严格的 JSON，不要输出任何 JSON 以外的文字。

你必须按照以下结构输出：

{
  "word": "查询词本身",
  "type": "word 或 chunk 或 phrase",
  "core_sense": "一句话说清：母语者在什么场景下会用这个词，而不是它的同义词。中文解释。",
  "native_scenes": [
    {
      "scene": "中文场景名",
      "en": "英文原句",
      "cn": "中文翻译"
    }
  ],
  "synonyms": [
    {
      "word": "同义词",
      "register": "语域说明",
      "example": "英文例句"
    }
  ],
  "synonym_chunks": [
    {
      "chunk": "相关口语 chunk",
      "meaning": "中文意思",
      "example": "英文例句"
    }
  ],
  "tts_focus": "朗读提示"
}

规则：
1. native_scenes 至少 2 个，最多 3 个。例句必须是母语者日常会说的。
2. synonyms 至少 2 个，最多 4 个。按语域排列。
3. synonym_chunks 至少 1 个，最多 3 个。
4. 如果查询词是 chunk，type 设为 "chunk"。
5. 英文例句自然、简短、可直接背诵。
6. 如果用户输入中文，word 字段填最常用的英文对应词。`;

export default async function handler(req, res) {
  // CORS（允许你的前端域名，第一版先放开）
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { query, password } = req.body || {};

  // 1. 验证访问密码
  const expectedPassword = process.env.ACCESS_PASSWORD;
  if (!expectedPassword || password !== expectedPassword) {
    return res.status(401).json({ error: '访问密码错误' });
  }

  if (!query || !query.trim()) {
    return res.status(400).json({ error: '请输入要查询的词' });
  }

  // 2. 调用 DeepSeek
  try {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-flash',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: query.trim() }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('DeepSeek error:', errText);
      return res.status(500).json({ error: 'AI 服务暂时不可用' });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content || !content.trim()) {
      return res.status(500).json({ error: 'AI 返回为空，请重试' });
    }

    // 解析 JSON（DeepSeek json_object 模式应该返回合法 JSON，但做兜底）
    let card;
    try {
      card = JSON.parse(content);
    } catch (e) {
      console.error('JSON parse error:', content);
      return res.status(500).json({ error: 'AI 返回格式异常，请重试' });
    }

    return res.status(200).json({ success: true, card });

  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: '服务器错误' });
  }
}