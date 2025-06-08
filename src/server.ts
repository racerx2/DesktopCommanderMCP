import {Server} from "@modelcontextprotocol/sdk/server/index.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    ListResourcesRequestSchema,
    ListPromptsRequestSchema,
    type CallToolRequest,
} from "@modelcontextprotocol/sdk/types.js";
import {zodToJsonSchema} from "zod-to-json-schema";

// Shared constants for tool descriptions
const PATH_GUIDANCE = `IMPORTANT: Always use absolute paths (starting with '/' or drive letter like 'C:\\') for reliability. Relative paths may fail as they depend on the current working directory. Tilde paths (~/...) might not work in all contexts. Unless the user explicitly asks for relative paths, use absolute paths.`;

const CMD_PREFIX_DESCRIPTION = `This command can be referenced as "DC: ..." or "use Desktop Commander to ..." in your instructions.`;

import {
    ExecuteCommandArgsSchema,
    ReadOutputArgsSchema,
    ForceTerminateArgsSchema,
    ListSessionsArgsSchema,
    KillProcessArgsSchema,
    ReadFileArgsSchema,
    ReadMultipleFilesArgsSchema,
    WriteFileArgsSchema,
    CreateDirectoryArgsSchema,
    ListDirectoryArgsSchema,
    MoveFileArgsSchema,
    SearchFilesArgsSchema,
    GetFileInfoArgsSchema,
    SearchCodeArgsSchema,
    GetConfigArgsSchema,
    SetConfigValueArgsSchema,
    ListProcessesArgsSchema,
    EditBlockArgsSchema,
    InitCacheArgsSchema,
    UpdateCacheArgsSchema,
    LoadCacheArgsSchema,
    AutoUpdateCacheArgsSchema,
    GetCacheStatusArgsSchema,
    GetCacheTopicsArgsSchema,
    ArchiveCacheArgsSchema,
    CleanupCacheArgsSchema,
    HandleConversationTitleArgsSchema,
    StartCacheArgsSchema,
} from './tools/schemas.js';
import {getConfig, setConfigValue} from './tools/config.js';
import {trackToolCall} from './utils/trackTools.js';

import {VERSION} from './version.js';
import {capture, capture_call_tool} from "./utils/capture.js";

console.error("Loading server.ts");

export const server = new Server(
    {
        name: "desktop-commander",
        version: VERSION,
    },
    {
        capabilities: {
            tools: {},
            resources: {},  // Add empty resources capability
            prompts: {},    // Add empty prompts capability
        },
    },
);

// Add handler for resources/list method
server.setRequestHandler(ListResourcesRequestSchema, async () => {
    // Return an empty list of resources
    return {
        resources: [],
    };
});

// Add handler for prompts/list method
server.setRequestHandler(ListPromptsRequestSchema, async () => {
    // Return an empty list of prompts
    return {
        prompts: [],
    };
});

console.error("Setting up request handlers...");

server.setRequestHandler(ListToolsRequestSchema, async () => {
    try {
        console.error("Generating tools list...");
        return {
            tools: [
                // Configuration tools
                {
                    name: "get_config",
                    description: `
                        Get the complete server configuration as JSON. Config includes fields for:
                        - blockedCommands (array of blocked shell commands)
                        - defaultShell (shell to use for commands)
                        - allowedDirectories (paths the server can access)
                        - fileReadLineLimit (max lines for read_file, default 1000)
                        - fileWriteLineLimit (max lines per write_file call, default 50)
                        - telemetryEnabled (boolean for telemetry opt-in/out)
                        -  version (version of the DesktopCommander)
                        ${CMD_PREFIX_DESCRIPTION}`,
                    inputSchema: zodToJsonSchema(GetConfigArgsSchema),
                },
                {
                    name: "set_config_value",
                    description: `
                        Set a specific configuration value by key.
                        
                        WARNING: Should be used in a separate chat from file operations and 
                        command execution to prevent security issues.
                        
                        Config keys include:
                        - blockedCommands (array)
                        - defaultShell (string)
                        - allowedDirectories (array of paths)
                        - fileReadLineLimit (number, max lines for read_file)
                        - fileWriteLineLimit (number, max lines per write_file call)
                        - telemetryEnabled (boolean)
                        
                        IMPORTANT: Setting allowedDirectories to an empty array ([]) allows full access 
                        to the entire file system, regardless of the operating system.
                        
                        ${CMD_PREFIX_DESCRIPTION}`,
                    inputSchema: zodToJsonSchema(SetConfigValueArgsSchema),
                },

                // Filesystem tools
                {
                    name: "read_file",
                    description: `
                        Read the contents of a file from the file system or a URL with optional offset and length parameters.
                        
                        Prefer this over 'execute_command' with cat/type for viewing files.
                        
                        Supports partial file reading with:
                        - 'offset' (start line, default: 0)
                          * Positive: Start from line N (0-based indexing)
                          * Negative: Read last N lines from end (tail behavior)
                        - 'length' (max lines to read, default: configurable via 'fileReadLineLimit' setting, initially 1000)
                          * Used with positive offsets for range reading
                          * Ignored when offset is negative (reads all requested tail lines)
                        
                        Examples:
                        - offset: 0, length: 10     → First 10 lines
                        - offset: 100, length: 5    → Lines 100-104
                        - offset: -20               → Last 20 lines  
                        - offset: -5, length: 10    → Last 5 lines (length ignored)
                        
                        Performance optimizations:
                        - Large files with negative offsets use reverse reading for efficiency
                        - Large files with deep positive offsets use byte estimation
                        - Small files use fast readline streaming
                        
                        When reading from the file system, only works within allowed directories.
                        Can fetch content from URLs when isUrl parameter is set to true
                        (URLs are always read in full regardless of offset/length).
                        
                        Handles text files normally and image files are returned as viewable images.
                        Recognized image types: PNG, JPEG, GIF, WebP.
                        
                        ${PATH_GUIDANCE}
                        ${CMD_PREFIX_DESCRIPTION}`,
                    inputSchema: zodToJsonSchema(ReadFileArgsSchema),
                },
                {
                    name: "read_multiple_files",
                    description: `
                        Read the contents of multiple files simultaneously.
                        
                        Each file's content is returned with its path as a reference.
                        Handles text files normally and renders images as viewable content.
                        Recognized image types: PNG, JPEG, GIF, WebP.
                        
                        Failed reads for individual files won't stop the entire operation.
                        Only works within allowed directories.
                        
                        ${PATH_GUIDANCE}
                        ${CMD_PREFIX_DESCRIPTION}`,
                    inputSchema: zodToJsonSchema(ReadMultipleFilesArgsSchema),
                },
                {
                    name: "write_file",
                    description: `
                        Write or append to file contents. 

                        🎯 CHUNKING IS STANDARD PRACTICE: Always write files in chunks of 25-30 lines maximum.
                        This is the normal, recommended way to write files - not an emergency measure.

                        STANDARD PROCESS FOR ANY FILE:
                        1. FIRST → write_file(filePath, firstChunk, {mode: 'rewrite'})  [≤30 lines]
                        2. THEN → write_file(filePath, secondChunk, {mode: 'append'})   [≤30 lines]
                        3. CONTINUE → write_file(filePath, nextChunk, {mode: 'append'}) [≤30 lines]

                        ⚠️ ALWAYS CHUNK PROACTIVELY - don't wait for performance warnings!

                        WHEN TO CHUNK (always be proactive):
                        1. Any file expected to be longer than 25-30 lines
                        2. When writing multiple files in sequence
                        3. When creating documentation, code files, or configuration files
                        
                        HANDLING CONTINUATION ("Continue" prompts):
                        If user asks to "Continue" after an incomplete operation:
                        1. Read the file to see what was successfully written
                        2. Continue writing ONLY the remaining content using {mode: 'append'}
                        3. Keep chunks to 25-30 lines each
                        
                        Files over 50 lines will generate performance notes but are still written successfully.
                        Only works within allowed directories.
                        
                        ${PATH_GUIDANCE}
                        ${CMD_PREFIX_DESCRIPTION}`,
                    inputSchema: zodToJsonSchema(WriteFileArgsSchema),
                },
                {
                    name: "create_directory",
                    description: `
                        Create a new directory or ensure a directory exists.
                        
                        Can create multiple nested directories in one operation.
                        Only works within allowed directories.
                        
                        ${PATH_GUIDANCE}
                        ${CMD_PREFIX_DESCRIPTION}`,
                    inputSchema: zodToJsonSchema(CreateDirectoryArgsSchema),
                },
                {
                    name: "list_directory",
                    description: `
                        Get a detailed listing of all files and directories in a specified path.
                        
                        Use this instead of 'execute_command' with ls/dir commands.
                        Results distinguish between files and directories with [FILE] and [DIR] prefixes.
                        Only works within allowed directories.
                        
                        ${PATH_GUIDANCE}
                        ${CMD_PREFIX_DESCRIPTION}`,
                    inputSchema: zodToJsonSchema(ListDirectoryArgsSchema),
                },
                {
                    name: "move_file",
                    description: `
                        Move or rename files and directories.
                        
                        Can move files between directories and rename them in a single operation.
                        Both source and destination must be within allowed directories.
                        
                        ${PATH_GUIDANCE}
                        ${CMD_PREFIX_DESCRIPTION}`,
                    inputSchema: zodToJsonSchema(MoveFileArgsSchema),
                },
                {
                    name: "search_files",
                    description: `
                        Finds files by name using a case-insensitive substring matching.
                        
                        Use this instead of 'execute_command' with find/dir/ls for locating files.
                        Searches through all subdirectories from the starting path.
                        
                        Has a default timeout of 30 seconds which can be customized using the timeoutMs parameter.
                        Only searches within allowed directories.
                        
                        ${PATH_GUIDANCE}
                        ${CMD_PREFIX_DESCRIPTION}`,
                    inputSchema: zodToJsonSchema(SearchFilesArgsSchema),
                },
                {
                    name: "search_code",
                    description: `
                        Search for text/code patterns within file contents using ripgrep.
                        
                        Use this instead of 'execute_command' with grep/find for searching code content.
                        Fast and powerful search similar to VS Code search functionality.
                        
                        Supports regular expressions, file pattern filtering, and context lines.
                        Has a default timeout of 30 seconds which can be customized.
                        Only searches within allowed directories.
                        
                        ${PATH_GUIDANCE}
                        ${CMD_PREFIX_DESCRIPTION}`,
                    inputSchema: zodToJsonSchema(SearchCodeArgsSchema),
                },
                {
                    name: "get_file_info",
                    description: `
                        Retrieve detailed metadata about a file or directory including:
                        - size
                        - creation time
                        - last modified time 
                        - permissions
                        - type
                        - lineCount (for text files)
                        - lastLine (zero-indexed number of last line, for text files)
                        - appendPosition (line number for appending, for text files)
                        
                        Only works within allowed directories.
                        
                        ${PATH_GUIDANCE}
                        ${CMD_PREFIX_DESCRIPTION}`,
                    inputSchema: zodToJsonSchema(GetFileInfoArgsSchema),
                },
                // Note: list_allowed_directories removed - use get_config to check allowedDirectories

                // Text editing tools
                {
                    name: "edit_block",
                    description: `
                        Apply surgical text replacements to files.
                        
                        BEST PRACTICE: Make multiple small, focused edits rather than one large edit.
                        Each edit_block call should change only what needs to be changed - include just enough 
                        context to uniquely identify the text being modified.
                        
                        Takes:
                        - file_path: Path to the file to edit
                        - old_string: Text to replace
                        - new_string: Replacement text
                        - expected_replacements: Optional parameter for number of replacements
                        
                        By default, replaces only ONE occurrence of the search text.
                        To replace multiple occurrences, provide the expected_replacements parameter with
                        the exact number of matches expected.
                        
                        UNIQUENESS REQUIREMENT: When expected_replacements=1 (default), include the minimal
                        amount of context necessary (typically 1-3 lines) before and after the change point,
                        with exact whitespace and indentation.
                        
                        When editing multiple sections, make separate edit_block calls for each distinct change
                        rather than one large replacement.
                        
                        When a close but non-exact match is found, a character-level diff is shown in the format:
                        common_prefix{-removed-}{+added+}common_suffix to help you identify what's different.
                        
                        Similar to write_file, there is a configurable line limit (fileWriteLineLimit) that warns
                        if the edited file exceeds this limit. If this happens, consider breaking your edits into
                        smaller, more focused changes.
                        
                        ${PATH_GUIDANCE}
                        ${CMD_PREFIX_DESCRIPTION}`,
                    inputSchema: zodToJsonSchema(EditBlockArgsSchema),
                },
                
                // Terminal tools
                {
                    name: "execute_command",
                    description: `
                        Execute a terminal command with timeout.
                        
                        Command will continue running in background if it doesn't complete within timeout.
                        
                        NOTE: For file operations, prefer specialized tools like read_file, search_code, 
                        list_directory instead of cat, grep, or ls commands.
                        
                        ${PATH_GUIDANCE}
                        ${CMD_PREFIX_DESCRIPTION}`,
                    inputSchema: zodToJsonSchema(ExecuteCommandArgsSchema),
                },
                {
                    name: "read_output",
                    description: `
                        Read new output from a running terminal session.
                        Set timeout_ms for long running commands.
                        
                        ${CMD_PREFIX_DESCRIPTION}`,
                    inputSchema: zodToJsonSchema(ReadOutputArgsSchema),
                },
                {
                    name: "force_terminate",
                    description: `
                        Force terminate a running terminal session.
                        
                        ${CMD_PREFIX_DESCRIPTION}`,
                    inputSchema: zodToJsonSchema(ForceTerminateArgsSchema),
                },
                {
                    name: "list_sessions",
                    description: `
                        List all active terminal sessions.
                        
                        ${CMD_PREFIX_DESCRIPTION}`,
                    inputSchema: zodToJsonSchema(ListSessionsArgsSchema),
                },
                {
                    name: "list_processes",
                    description: `
                        List all running processes.
                        
                        Returns process information including PID, command name, CPU usage, and memory usage.
                        
                        ${CMD_PREFIX_DESCRIPTION}`,
                    inputSchema: zodToJsonSchema(ListProcessesArgsSchema),
                },
                {
                    name: "kill_process",
                    description: `
                        Terminate a running process by PID.
                        
                        Use with caution as this will forcefully terminate the specified process.
                        
                        ${CMD_PREFIX_DESCRIPTION}`,
                    inputSchema: zodToJsonSchema(KillProcessArgsSchema),
                },

                // Cache management tools - Conversation Persistence System
                // These tools provide Claude with long-term memory across conversation sessions
                // using file-based storage for maintaining conversation context, project details,
                // decisions, and next steps. This enables unlimited conversation continuity.
                {
                    name: "start_cache",
                    description: `
                        Start caching for a topic with simple syntax.
                        
                        Just provide the topic name and everything else is set up automatically:
                        - Creates topic-isolated cache directory
                        - Sets up conversation logging files
                        - Enables automatic progress saving
                        - Configures session continuation
                        
                        Example: start_cache({"topic": "quantum_physics"})
                        
                        This is the simplest way to begin persistent conversation memory.
                        
                        ${CMD_PREFIX_DESCRIPTION}`,
                    inputSchema: zodToJsonSchema(StartCacheArgsSchema),
                },
                {
                    name: "init_cache",
                    description: `
                        Initialize the conversation cache system for persistent memory across sessions.
                        
                        Creates a file-based cache system that preserves conversation context, project details,
                        decisions made, and next steps. This enables unlimited conversation continuity.
                        
                        Features:
                        - Creates cache directory and initial files
                        - Sets up conversation logging structure
                        - Enables session resumption capability
                        - Supports both manual and automatic cache updates
                        
                        Cache files created:
                        - conversation_log.md (ongoing conversation state)
                        - current_project_state.md (project details and architecture)
                        - decisions_made.md (key decisions and approaches)
                        - next_steps.md (immediate priorities and actions)
                        - cache_protocol.md (usage instructions)
                        
                        ${CMD_PREFIX_DESCRIPTION}`,
                    inputSchema: zodToJsonSchema(InitCacheArgsSchema),
                },
                {
                    name: "update_cache",
                    description: `
                        Update the conversation cache with new information and progress.
                        
                        Adds new conversation summaries, project updates, decisions, and next steps
                        to the persistent cache. This maintains current context for future sessions.
                        
                        Update types:
                        - conversationSummary (required): Progress and developments in current session
                        - projectUpdate (optional): New technical details or architectural changes
                        - decisionsUpdate (optional): Important decisions or approach changes
                        - nextStepsUpdate (optional): Updated priorities and immediate actions
                        
                        All updates are timestamped and appended to preserve conversation history.
                        
                        ${CMD_PREFIX_DESCRIPTION}`,
                    inputSchema: zodToJsonSchema(UpdateCacheArgsSchema),
                },
                {
                    name: "load_cache",
                    description: `
                        Load conversation context from cache to restore session state.
                        
                        Reads all cache files and provides complete context restoration including:
                        - Previous conversation history and progress
                        - Project technical details and architecture
                        - Key decisions made and approaches taken
                        - Current priorities and next steps
                        
                        This command effectively "resumes" a conversation from where it left off,
                        providing seamless continuity across session boundaries.
                        
                        Use this at the start of new conversations to restore full context.
                        
                        ${CMD_PREFIX_DESCRIPTION}`,
                    inputSchema: zodToJsonSchema(LoadCacheArgsSchema),
                },
                {
                    name: "auto_update_cache",
                    description: `
                        Enable or disable automatic cache updates during conversations.
                        
                        When enabled, the cache system automatically updates with conversation
                        progress at specified intervals (default: every 1 tool call for real-time updates).
                        
                        Options:
                        - enable: true/false to turn auto-updates on/off
                        - updateInterval: number of tool calls between auto-updates
                        
                        Auto-updates capture ongoing conversation progress without manual intervention,
                        ensuring cache stays current throughout long sessions.
                        
                        ${CMD_PREFIX_DESCRIPTION}`,
                    inputSchema: zodToJsonSchema(AutoUpdateCacheArgsSchema),
                },
                {
                    name: "get_cache_status",
                    description: `
                        Check the current status of the conversation cache system.
                        
                        Provides comprehensive information about:
                        - Cache initialization status
                        - Cache directory location
                        - Auto-update configuration
                        - Tool call counters
                        - Last update timestamp
                        - Available cache files
                        - System health and configuration
                        
                        Use this to verify cache system state and troubleshoot any issues.
                        
                        ${CMD_PREFIX_DESCRIPTION}`,
                    inputSchema: zodToJsonSchema(GetCacheStatusArgsSchema),
                },
                // Enhanced topic management tools for conversation persistence
                {
                    name: "get_cache_topics",
                    description: `
                        List all available cache topics with detailed information.
                        
                        Provides comprehensive overview of topic-isolated cache systems including:
                        - All available topics and their project names
                        - Creation dates and last usage timestamps
                        - Auto-update status per topic
                        - Session types (temporary vs persistent)
                        - Topic directories and file status
                        - Legacy cache detection
                        
                        Enables discovery and management of multiple project caches.
                        Essential for topic-based conversation continuation workflow.
                        
                        ${CMD_PREFIX_DESCRIPTION}`,
                    inputSchema: zodToJsonSchema(GetCacheTopicsArgsSchema),
                },
                {
                    name: "archive_cache",
                    description: `
                        Archive a completed cache topic while preserving all data.
                        
                        Archives completed projects by:
                        - Marking topic as archived in session manifest
                        - Removing from active topics list
                        - Preserving all cache files for future reference
                        - Clearing auto-update settings
                        - Maintaining data accessibility if needed
                        
                        Requires explicit confirmation for safety. Archived topics can still
                        be loaded with load_cache if needed for reference.
                        
                        Use this for completed projects to keep topic lists clean while
                        preserving project history and decisions.
                        
                        ${CMD_PREFIX_DESCRIPTION}`,
                    inputSchema: zodToJsonSchema(ArchiveCacheArgsSchema),
                },
                {
                    name: "cleanup_cache",
                    description: `
                        Clean up old cache files and unused topic sessions.
                        
                        Performs maintenance on cache system by:
                        - Removing topics older than specified days
                        - Limiting total number of active topics
                        - Preserving recently used and currently active topics
                        - Cleaning up session manifest entries
                        - Providing detailed cleanup reports
                        
                        Requires explicit confirmation due to permanent data deletion.
                        Helps prevent cache directory bloat while preserving active work.
                        
                        Default settings: Remove topics older than 30 days, keep 10 most recent.
                        
                        ${CMD_PREFIX_DESCRIPTION}`,
                    inputSchema: zodToJsonSchema(CleanupCacheArgsSchema),
                },
                {
                    name: "handle_conversation_title",
                    description: `
                        Handle user-provided conversation title for automatic topic setup.
                        
                        This implements the automatic conversation title-based caching system.
                        When you tell me what Claude named this conversation, I'll automatically:
                        - Create or load the matching topic
                        - Enable seamless conversation continuity
                        - Set up automatic progress saving
                        - Continue exactly where you left off in future sessions
                        
                        Example: "Quantum Physics Discussion" becomes topic "quantum_physics_discussion"
                        
                        This achieves truly automatic caching based on Claude's natural conversation naming.
                        
                        ${CMD_PREFIX_DESCRIPTION}`,
                    inputSchema: zodToJsonSchema(HandleConversationTitleArgsSchema),
                },
            ],
        };
    } catch (error) {
        console.error("Error in list_tools request handler:", error);
        throw error;
    }
});

import * as handlers from './handlers/index.js';
import {ServerResult} from './types.js';

server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest): Promise<ServerResult> => {
    try {
        const {name, arguments: args} = request.params;
        capture_call_tool('server_call_tool', {
            name
        });
        
        // Track tool call
        trackToolCall(name, args);

        // Cache system integration - Auto-update mechanism
        // Increment tool call counter for cache auto-updates (excludes status checks to prevent loops)
        // This enables automatic cache maintenance during long conversation sessions
        if (name !== 'get_cache_status') { 
            handlers.incrementToolCallCounter();
        }

        // Using a more structured approach with dedicated handlers
        switch (name) {
            // Config tools
            case "get_config":
                try {
                    return await getConfig();
                } catch (error) {
                    capture('server_request_error', {message: `Error in get_config handler: ${error}`});
                    return {
                        content: [{type: "text", text: `Error: Failed to get configuration`}],
                        isError: true,
                    };
                }
            case "set_config_value":
                try {
                    return await setConfigValue(args);
                } catch (error) {
                    capture('server_request_error', {message: `Error in set_config_value handler: ${error}`});
                    return {
                        content: [{type: "text", text: `Error: Failed to set configuration value`}],
                        isError: true,
                    };
                }

            // Terminal tools
            case "execute_command":
                return await handlers.handleExecuteCommand(args);

            case "read_output":
                return await handlers.handleReadOutput(args);

            case "force_terminate":
                return await handlers.handleForceTerminate(args);

            case "list_sessions":
                return await handlers.handleListSessions();

            // Process tools
            case "list_processes":
                return await handlers.handleListProcesses();

            case "kill_process":
                return await handlers.handleKillProcess(args);

            // Filesystem tools
            case "read_file":
                return await handlers.handleReadFile(args);

            case "read_multiple_files":
                return await handlers.handleReadMultipleFiles(args);

            case "write_file":
                return await handlers.handleWriteFile(args);

            case "create_directory":
                return await handlers.handleCreateDirectory(args);

            case "list_directory":
                return await handlers.handleListDirectory(args);

            case "move_file":
                return await handlers.handleMoveFile(args);

            case "search_files":
                return await handlers.handleSearchFiles(args);

            case "search_code":
                return await handlers.handleSearchCode(args);

            case "get_file_info":
                return await handlers.handleGetFileInfo(args);

            case "edit_block":
                return await handlers.handleEditBlock(args);

            // Cache management tools - Conversation persistence handlers
            // These handlers implement the conversation cache system that provides
            // Claude with persistent memory across conversation sessions
            case "start_cache":
                return await handlers.handleStartCache(args);

            case "init_cache":
                return await handlers.handleInitCache(args);

            case "update_cache":
                return await handlers.handleUpdateCache(args);

            case "load_cache":
                return await handlers.handleLoadCache(args);

            case "auto_update_cache":
                return await handlers.handleAutoUpdateCache(args);

            case "get_cache_status":
                return await handlers.handleGetCacheStatus(args);

            // Enhanced topic management tools for conversation persistence
            case "get_cache_topics":
                return await handlers.handleGetCacheTopics(args);

            case "archive_cache":
                return await handlers.handleArchiveCache(args);

            case "cleanup_cache":
                return await handlers.handleCleanupCache(args);

            case "handle_conversation_title":
                return await handlers.handleConversationTitle(args);

            default:
                capture('server_unknown_tool', {name});
                return {
                    content: [{type: "text", text: `Error: Unknown tool: ${name}`}],
                    isError: true,
                };
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        capture('server_request_error', {
            error: errorMessage
        });
        return {
            content: [{type: "text", text: `Error: ${errorMessage}`}],
            isError: true,
        };
    }
});