// Recorded by scripts/characterisation/record.mjs -- see ../harness.ts. Review the diff: it is the baseline.
export const PINNED: Record<string, unknown> = {
  "data policies, as a platform administrator before a workspace is picked": {
    "url": "/administration/data-policies",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /tenant.json/listTenants"
    ],
    "headings": [
      "Data policies"
    ],
    "buttons": [],
    "columns": [],
    "fields": [
      "Pick a workspace",
      "Workspace",
      "Workspace whose data policy to read"
    ],
    "links": [],
    "page": {
      "state": "",
      "levels": [],
      "footer": null
    }
  },
  "data policies, as a tenant user without the Prompts page": {
    "url": "/unauthorized?page=ai-prompts",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1"
    ],
    "headings": [
      "Prompts isn't part of your access"
    ],
    "buttons": [
      "Request access"
    ],
    "columns": [],
    "fields": [],
    "links": [
      "/"
    ]
  },
  "the defaults, as a tenant user with every page": {
    "url": "/administration/data-policies",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /aiPrompt.json/dataPolicy"
    ],
    "headings": [
      "Data policies",
      "Public",
      "Internal",
      "Sensitive",
      "How a call's level is decided"
    ],
    "buttons": [
      "Refresh"
    ],
    "columns": [],
    "fields": [],
    "links": [],
    "page": {
      "state": "Not saved yet — these are the defaults They are what runs today: public and internal data may go to any model and the AI Assistant's write tools may act on it; sensitive data stays on local models and",
      "levels": [
        {
          "level": "public",
          "state": "Default",
          "rule": null,
          "models": [],
          "switches": [],
          "terms": [
            "Model rule: Any model",
            "Allowed models: Any the rule allows",
            "Keep run files: The pipeline's own",
            "AI write tools: On",
            "Minimum-fields warning: On"
          ]
        },
        {
          "level": "internal",
          "state": "Default",
          "rule": null,
          "models": [],
          "switches": [],
          "terms": [
            "Model rule: Any model",
            "Allowed models: Any the rule allows",
            "Keep run files: The pipeline's own",
            "AI write tools: On",
            "Minimum-fields warning: On"
          ]
        },
        {
          "level": "sensitive",
          "state": "Default",
          "rule": null,
          "models": [],
          "switches": [],
          "terms": [
            "Model rule: Local only",
            "Allowed models: Any the rule allows",
            "Keep run files: The pipeline's own",
            "AI write tools: Off",
            "Minimum-fields warning: On"
          ]
        }
      ],
      "footer": null
    }
  },
  "the defaults, as a workspace administrator": {
    "url": "/administration/data-policies",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /aiPrompt.json/dataPolicy",
      "GET /aiConnection.json/list"
    ],
    "headings": [
      "Data policies",
      "Public",
      "Internal",
      "Sensitive",
      "How a call's level is decided"
    ],
    "buttons": [
      "Discard changes",
      "Refresh",
      "Save policy"
    ],
    "columns": [],
    "fields": [
      "AI write toolsThe assistant may run pipelines, create PDFs, save or delete files and call APIs that change data. It still asks you first.",
      "Keep run files (days)",
      "Local Ollama — any model",
      "Minimum-fields warningRemind whoever builds a step to send a model only the fields it needs.",
      "Model rule",
      "The pipeline's own",
      "UI-CHECK Ollama qwen3 (tool loop) — any model",
      "gemma3:1b",
      "gemma3:4b",
      "qwen3:8b"
    ],
    "links": [
      "/ai/connections"
    ],
    "page": {
      "state": "Not saved yet — these are the defaults They are what runs today: public and internal data may go to any model and the AI Assistant's write tools may act on it; sensitive data stays on local models and",
      "levels": [
        {
          "level": "public",
          "state": "Default",
          "rule": "any",
          "models": [
            "1049",
            "1049|qwen3:8b",
            "1047",
            "1047|gemma3:1b",
            "1047|gemma3:4b",
            "1047|qwen3:8b"
          ],
          "switches": [
            "aiWriteTools: on",
            "minFieldsWarning: on"
          ],
          "terms": []
        },
        {
          "level": "internal",
          "state": "Default",
          "rule": "any",
          "models": [
            "1049",
            "1049|qwen3:8b",
            "1047",
            "1047|gemma3:1b",
            "1047|gemma3:4b",
            "1047|qwen3:8b"
          ],
          "switches": [
            "aiWriteTools: on",
            "minFieldsWarning: on"
          ],
          "terms": []
        },
        {
          "level": "sensitive",
          "state": "Default",
          "rule": "local",
          "models": [
            "1049",
            "1049|qwen3:8b",
            "1047",
            "1047|gemma3:1b",
            "1047|gemma3:4b",
            "1047|qwen3:8b"
          ],
          "switches": [
            "aiWriteTools: off",
            "minFieldsWarning: on"
          ],
          "terms": []
        }
      ],
      "footer": "No changes"
    }
  }
};
