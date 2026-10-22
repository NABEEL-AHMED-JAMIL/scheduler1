// Recorded by scripts/characterisation/record.mjs -- see ../harness.ts. Review the diff: it is the baseline.
export const PINNED: Record<string, unknown> = {
  "data policies, as a platform administrator before a workspace is picked": {
    "url": "/administration/data-policies",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1"
    ],
    "headings": [
      "Data policies"
    ],
    "buttons": [
      "Platform minimums"
    ],
    "columns": [],
    "fields": [],
    "links": [
      "/administration",
      "/administration/access-profiles",
      "/administration/appearance",
      "/administration/data-policies",
      "/administration/security",
      "/administration/users",
      "/platform/workspaces"
    ],
    "page": {
      "state": "",
      "levels": [],
      "footer": null
    }
  },
  "data policies, as a tenant user without the Prompts page": {
    "url": "/unauthorized?page=ai-prompts&title=Data%20policies",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1"
    ],
    "headings": [
      "Data policies isn't part of your access"
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
      "GET /aiPrompt.json/dataPolicy",
      "GET /sourceJob.json/review/policy",
      "GET /documentReview.json/policy",
      "GET /pageAccess.json/delegates/mine"
    ],
    "headings": [
      "Data policies",
      "Sensitive",
      "Internal",
      "Public",
      "How a call's level is decided",
      "Bulk review"
    ],
    "buttons": [
      "Refresh"
    ],
    "columns": [
      [
        "Setting",
        "Sensitive Personal, health or confidential data (PHI, PII, confidential, restricted).Default",
        "Internal The workspace's everyday data. A call is internal when nothing says otherwise.Default",
        "Public Data anyone may see: published figures, open datasets and APIs.Default"
      ]
    ],
    "fields": [],
    "links": [
      "/administration"
    ],
    "page": {
      "state": "Not saved yet — these are the defaults They are what runs today: public and internal data may go to any model and the AI Assistant's write tools may act on it; sensitive data stays on local models and",
      "levels": [
        {
          "level": "sensitive",
          "state": "Default",
          "rule": null,
          "models": [],
          "switches": [],
          "terms": []
        },
        {
          "level": "internal",
          "state": "Default",
          "rule": null,
          "models": [],
          "switches": [],
          "terms": []
        },
        {
          "level": "public",
          "state": "Default",
          "rule": null,
          "models": [],
          "switches": [],
          "terms": []
        },
        {
          "level": "sensitive",
          "state": "",
          "rule": null,
          "models": [],
          "switches": [],
          "terms": []
        },
        {
          "level": "internal",
          "state": "",
          "rule": null,
          "models": [],
          "switches": [],
          "terms": []
        },
        {
          "level": "public",
          "state": "",
          "rule": null,
          "models": [],
          "switches": [],
          "terms": []
        },
        {
          "level": "sensitive",
          "state": "",
          "rule": null,
          "models": [],
          "switches": [],
          "terms": []
        },
        {
          "level": "internal",
          "state": "",
          "rule": null,
          "models": [],
          "switches": [],
          "terms": []
        },
        {
          "level": "public",
          "state": "",
          "rule": null,
          "models": [],
          "switches": [],
          "terms": []
        },
        {
          "level": "sensitive",
          "state": "",
          "rule": null,
          "models": [],
          "switches": [],
          "terms": []
        },
        {
          "level": "internal",
          "state": "",
          "rule": null,
          "models": [],
          "switches": [],
          "terms": []
        },
        {
          "level": "public",
          "state": "",
          "rule": null,
          "models": [],
          "switches": [],
          "terms": []
        },
        {
          "level": "sensitive",
          "state": "",
          "rule": null,
          "models": [],
          "switches": [],
          "terms": []
        },
        {
          "level": "internal",
          "state": "",
          "rule": null,
          "models": [],
          "switches": [],
          "terms": []
        },
        {
          "level": "public",
          "state": "",
          "rule": null,
          "models": [],
          "switches": [],
          "terms": []
        },
        {
          "level": "sensitive",
          "state": "",
          "rule": null,
          "models": [],
          "switches": [],
          "terms": []
        },
        {
          "level": "internal",
          "state": "",
          "rule": null,
          "models": [],
          "switches": [],
          "terms": []
        },
        {
          "level": "public",
          "state": "",
          "rule": null,
          "models": [],
          "switches": [],
          "terms": []
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
      "GET /aiConnection.json/list",
      "GET /sourceJob.json/review/policy",
      "GET /documentReview.json/policy",
      "GET /setting.json/retention",
      "GET /managedService.json/actions?limit=1"
    ],
    "headings": [
      "Data policies",
      "Sensitive",
      "Internal",
      "Public",
      "How a call's level is decided",
      "Bulk review",
      "Retention",
      "Legal holds"
    ],
    "buttons": [
      "Discard",
      "Discard changes",
      "Edit retention",
      "History",
      "Place a hold",
      "Preview",
      "Refresh",
      "Run now",
      "Save policy",
      "Save review policy"
    ],
    "columns": [
      [
        "Setting",
        "Sensitive Personal, health or confidential data (PHI, PII, confidential, restricted).Default",
        "Internal The workspace's everyday data. A call is internal when nothing says otherwise.Default",
        "Public Data anyone may see: published figures, open datasets and APIs.Default"
      ],
      [
        "Data",
        "Keep for",
        "Last pass",
        "Holds reach"
      ]
    ],
    "fields": [
      "Allow bulk approve of documents",
      "Allow bulk approve of runs",
      "Include documents whose rules fail",
      "Keep Internal run files (days)",
      "Keep Public run files (days)",
      "Keep Sensitive run files (days)",
      "Local Ollama — any model",
      "Model rule for Internal",
      "Model rule for Public",
      "Model rule for Sensitive",
      "Off",
      "On",
      "The pipeline's own",
      "UI-CHECK Ollama qwen3 (tool loop) — any model",
      "gemma3:1b",
      "gemma3:4b",
      "qwen3:8b"
    ],
    "links": [
      "/administration",
      "/administration/access-profiles",
      "/administration/appearance",
      "/administration/data-policies",
      "/administration/security",
      "/administration/users",
      "/settings/model-connections"
    ],
    "page": {
      "state": "Not saved yet — these are the defaults They are what runs today: public and internal data may go to any model and the AI Assistant's write tools may act on it; sensitive data stays on local models and",
      "levels": [
        {
          "level": "sensitive",
          "state": "Default",
          "rule": null,
          "models": [],
          "switches": [],
          "terms": []
        },
        {
          "level": "internal",
          "state": "Default",
          "rule": null,
          "models": [],
          "switches": [],
          "terms": []
        },
        {
          "level": "public",
          "state": "Default",
          "rule": null,
          "models": [],
          "switches": [],
          "terms": []
        },
        {
          "level": "sensitive",
          "state": "",
          "rule": "local",
          "models": [],
          "switches": [],
          "terms": []
        },
        {
          "level": "internal",
          "state": "",
          "rule": "any",
          "models": [],
          "switches": [],
          "terms": []
        },
        {
          "level": "public",
          "state": "",
          "rule": "any",
          "models": [],
          "switches": [],
          "terms": []
        },
        {
          "level": "sensitive",
          "state": "",
          "rule": null,
          "models": [
            "1049",
            "1049|qwen3:8b",
            "1047",
            "1047|gemma3:1b",
            "1047|gemma3:4b",
            "1047|qwen3:8b"
          ],
          "switches": [],
          "terms": []
        },
        {
          "level": "internal",
          "state": "",
          "rule": null,
          "models": [
            "1049",
            "1049|qwen3:8b",
            "1047",
            "1047|gemma3:1b",
            "1047|gemma3:4b",
            "1047|qwen3:8b"
          ],
          "switches": [],
          "terms": []
        },
        {
          "level": "public",
          "state": "",
          "rule": null,
          "models": [
            "1049",
            "1049|qwen3:8b",
            "1047",
            "1047|gemma3:1b",
            "1047|gemma3:4b",
            "1047|qwen3:8b"
          ],
          "switches": [],
          "terms": []
        },
        {
          "level": "sensitive",
          "state": "",
          "rule": null,
          "models": [],
          "switches": [],
          "terms": []
        },
        {
          "level": "internal",
          "state": "",
          "rule": null,
          "models": [],
          "switches": [],
          "terms": []
        },
        {
          "level": "public",
          "state": "",
          "rule": null,
          "models": [],
          "switches": [],
          "terms": []
        },
        {
          "level": "sensitive",
          "state": "",
          "rule": null,
          "models": [],
          "switches": [
            "aiWriteTools: off"
          ],
          "terms": []
        },
        {
          "level": "internal",
          "state": "",
          "rule": null,
          "models": [],
          "switches": [
            "aiWriteTools: on"
          ],
          "terms": []
        },
        {
          "level": "public",
          "state": "",
          "rule": null,
          "models": [],
          "switches": [
            "aiWriteTools: on"
          ],
          "terms": []
        },
        {
          "level": "sensitive",
          "state": "",
          "rule": null,
          "models": [],
          "switches": [
            "minFieldsWarning: on"
          ],
          "terms": []
        },
        {
          "level": "internal",
          "state": "",
          "rule": null,
          "models": [],
          "switches": [
            "minFieldsWarning: on"
          ],
          "terms": []
        },
        {
          "level": "public",
          "state": "",
          "rule": null,
          "models": [],
          "switches": [
            "minFieldsWarning: on"
          ],
          "terms": []
        },
        {
          "level": "sensitive",
          "state": "",
          "rule": null,
          "models": [],
          "switches": [],
          "terms": []
        },
        {
          "level": "internal",
          "state": "",
          "rule": null,
          "models": [],
          "switches": [],
          "terms": []
        },
        {
          "level": "public",
          "state": "",
          "rule": null,
          "models": [],
          "switches": [],
          "terms": []
        }
      ],
      "footer": "No changes"
    }
  }
};
