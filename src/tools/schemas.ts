import { z } from "zod";

// Config tools schemas
export const GetConfigArgsSchema = z.object({});

export const SetConfigValueArgsSchema = z.object({
  key: z.string(),
  value: z.any(),
});

// Empty schemas
export const ListProcessesArgsSchema = z.object({});

// Terminal tools schemas
export const ExecuteCommandArgsSchema = z.object({
  command: z.string(),
  timeout_ms: z.number(),
  shell: z.string().optional(),
});

export const ReadOutputArgsSchema = z.object({
  pid: z.number(),
  timeout_ms: z.number().optional(),
});

export const ForceTerminateArgsSchema = z.object({
  pid: z.number(),
});

export const ListSessionsArgsSchema = z.object({});

export const KillProcessArgsSchema = z.object({
  pid: z.number(),
});

// Filesystem tools schemas
export const ReadFileArgsSchema = z.object({
  path: z.string(),
  isUrl: z.boolean().optional().default(false),
  offset: z.number().optional().default(0),
  length: z.number().optional().default(1000),
});

export const ReadMultipleFilesArgsSchema = z.object({
  paths: z.array(z.string()),
});

export const WriteFileArgsSchema = z.object({
  path: z.string(),
  content: z.string(),
  mode: z.enum(['rewrite', 'append']).default('rewrite'),
});

export const CreateDirectoryArgsSchema = z.object({
  path: z.string(),
});

export const ListDirectoryArgsSchema = z.object({
  path: z.string(),
});

export const MoveFileArgsSchema = z.object({
  source: z.string(),
  destination: z.string(),
});

export const SearchFilesArgsSchema = z.object({
  path: z.string(),
  pattern: z.string(),
  timeoutMs: z.number().optional(),
});

export const GetFileInfoArgsSchema = z.object({
  path: z.string(),
});

// Search tools schema
export const SearchCodeArgsSchema = z.object({
  path: z.string(),
  pattern: z.string(),
  filePattern: z.string().optional(),
  ignoreCase: z.boolean().optional(),
  maxResults: z.number().optional(),
  includeHidden: z.boolean().optional(),
  contextLines: z.number().optional(),
  timeoutMs: z.number().optional(),
});

// Edit tools schema
export const EditBlockArgsSchema = z.object({
  file_path: z.string(),
  old_string: z.string(),
  new_string: z.string(),
  expected_replacements: z.number().optional().default(1),
});

// Cache tools schemas - Conversation persistence system
// These schemas define the input parameters for the conversation cache management tools
// that provide persistent memory across Claude conversation sessions

/**
 * Schema for initializing the conversation cache system
 * Creates a file-based persistence layer for maintaining conversation context
 */
export const InitCacheArgsSchema = z.object({
  cacheDir: z.string().optional().default("C:\\Claude_Session"),
  projectName: z.string().optional()
});

/**
 * Schema for updating the conversation cache with new information
 * Allows incremental updates to maintain current conversation state
 */
export const UpdateCacheArgsSchema = z.object({
  conversationSummary: z.string(),
  projectUpdate: z.string().optional(),
  decisionsUpdate: z.string().optional(),
  nextStepsUpdate: z.string().optional()
});

/**
 * Schema for loading conversation context from cache files
 * Restores complete conversation state for seamless session continuation
 */
export const LoadCacheArgsSchema = z.object({
  cacheDir: z.string().optional().default("C:\\Claude_Session")
});

/**
 * Schema for configuring automatic cache updates
 * Enables hands-off cache maintenance during long conversations
 */
export const AutoUpdateCacheArgsSchema = z.object({
  enable: z.boolean(),
  updateInterval: z.number().optional().default(10) // Every 10 tool calls
});

/**
 * Schema for checking cache system status
 * Provides comprehensive information about current cache state
 */
export const GetCacheStatusArgsSchema = z.object({});