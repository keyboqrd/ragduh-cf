/**
 * Configuration for the Deep Research Pipeline
 */

// Resource Allocation
export const RESEARCH_CONFIG = {
  budget: 2,
  maxQueries: 2,
  maxSources: 5,
  maxTokens: 8192,
};

const getCurrentDateContext = () => {
  // Date must be called inside request handler, not at module scope
  const now = new Date();

  // If Date is invalid (epoch 0), use a generic date prompt without specific year
  if (now.getFullYear() === 1970) {
    return `当前日期信息不可用。在回答问题时，请基于提供的搜索结果进行回答。`;
  }

  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const monthName = now.toLocaleString("zh-CN", { month: "long" });

  return `当前日期是${year}年${month}月${day}日 (${year}年${monthName}${day}日)。
在搜索近期信息时，优先关注${year}年的结果。
对于涉及最新发展的问题，请在搜索词中包含${year}年。`;
};

// Base prompts without date context - date will be injected at runtime
const BASE_PROMPTS = {
  planning: `你是一位战略规划研究员，擅长将复杂问题分解为逻辑清晰的搜索步骤。当收到研究主题或问题时，你会分析所需的具体信息，并制定顺序研究计划。

首先，识别问题的核心组成部分和任何隐含的信息需求。

然后提供 3-5 个顺序搜索查询的编号列表

你的查询应该：
- 具体且专注（避免返回一般信息的宽泛查询）
- 使用自然语言书写（不使用 AND/OR 等布尔运算符）
- 设计为从基础到具体信息的逻辑进展

从探索性查询开始"试探水深"是完全可以接受的。`,

  evaluation: `你是一位研究查询优化师。你的任务是分析搜索结果与原始研究目标的对比，并生成后续查询来填补信息空白。`,

  filter: `你是一位网络搜索过滤助理。你的任务是根据研究主题过滤和排名搜索结果。`,

  answer: `你是一位资深研究分析师，负责创建专业的、可发布的报告。
    仅使用提供的来源，生成一份 markdown 格式的文档。`,
};

// Get prompts with current date context - call this inside request handler
export const getPrompts = () => {
  const date = getCurrentDateContext();
  return {
    planningPrompt: `${date}\n${BASE_PROMPTS.planning}`,
    planParsingPrompt: `${date}\n你是一位研究助理，你将获得一个研究主题的行动计划，识别我们应该运行的查询来搜索该主题。`,
    rawContentSummarizerPrompt: `${date}\n你是一位研究提取专家。给定研究主题和原始网络内容，创建一个彻底详细的综合报告，作为连贯的叙述。`,
    evaluationPrompt: `${date}\n${BASE_PROMPTS.evaluation}`,
    evaluationParsingPrompt: `${date}\n你是一位研究助理，你将获得一些推理和查询列表，需要将它们解析为查询列表。`,
    filterPrompt: `${date}\n${BASE_PROMPTS.filter}`,
    sourceParsingPrompt: `${date}\n你是一位研究助理，你将获得搜索结果的相关性分析。`,
    answerPrompt: `${date}\n${BASE_PROMPTS.answer}`,
  };
};

export const PROMPTS = getPrompts();
