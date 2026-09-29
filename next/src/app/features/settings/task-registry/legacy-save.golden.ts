/**
 * MIG-250 evidence that a legacy pipeline saves exactly as before. Recorded on 2026-09-29 from the Configuration ›
 * Pipelines list as it was at bc500a8 (features/settings/pipelines/pipelines.ts, since replaced by the Task Registry):
 * its Edit, Duplicate and New pipeline opened PipelineDialog with this data, and the dialog's Save, unchanged, then
 * POSTed this request. The registry's specs open the same row the same way and must produce the same bytes.
 */
export const LEGACY_ROW = {
  "pipelineKey": 100167,
  "pipelineId": "REF_CSV_CHECK_V1",
  "pipelineName": "Reference: CSV check and summarise",
  "description": "service-1 reference pipeline.",
  "tenantId": 2924,
  "sourceTaskTypeId": 11831,
  "topicName": "service-1 reference worker",
  "kafkaTopic": "etl.reference",
  "status": "Active",
  "dateCreated": "2026-09-24T22:06:11.852167",
  "createdBy": 4537,
  "createdByName": "Casey Baseline",
  "fieldCount": 4,
  "requiredCount": 2
};

export const LEGACY_FIELDS = [
  {
    "pipelineFieldId": 1,
    "tagKey": "inputKey",
    "label": "Input CSV",
    "fieldType": "text",
    "required": true,
    "position": 0
  },
  {
    "pipelineFieldId": 2,
    "tagKey": "format",
    "label": "Shape",
    "fieldType": "select",
    "required": false,
    "defaultValue": "records",
    "fieldOptions": "records=JSON array\nlines=JSON Lines",
    "position": 1
  },
  {
    "pipelineFieldId": 5,
    "tagKey": "output",
    "label": "Output",
    "fieldType": "text",
    "required": false,
    "position": 2
  },
  {
    "pipelineFieldId": 3,
    "tagKey": "bucket",
    "tagParent": "output",
    "label": "Bucket",
    "fieldType": "text",
    "required": true,
    "helpText": "Where",
    "position": 3
  },
  {
    "pipelineFieldId": 4,
    "tagKey": "summary",
    "label": "Summary",
    "fieldType": "ai",
    "required": false,
    "position": 4,
    "promptId": 1049,
    "promptName": "Sum",
    "variableMap": "{\"text\":\"file:inputKey\"}",
    "onError": "fail",
    "runIn": "worker"
  }
];

/** What Edit handed PipelineDialog. */
export const EDIT_DATA = {
  "form": {
    "pipelineKey": 100167,
    "pipelineId": "REF_CSV_CHECK_V1",
    "pipelineName": "Reference: CSV check and summarise",
    "description": "service-1 reference pipeline.",
    "tenantId": 2924,
    "sourceTaskTypeId": 11831,
    "topicName": "service-1 reference worker",
    "kafkaTopic": "etl.reference",
    "status": "Active",
    "dateCreated": "2026-09-24T22:06:11.852167",
    "createdBy": 4537,
    "createdByName": "Casey Baseline",
    "fieldCount": 4,
    "requiredCount": 2,
    "fields": [
      {
        "pipelineFieldId": 1,
        "tagKey": "inputKey",
        "label": "Input CSV",
        "fieldType": "text",
        "required": true,
        "position": 0
      },
      {
        "pipelineFieldId": 2,
        "tagKey": "format",
        "label": "Shape",
        "fieldType": "select",
        "required": false,
        "defaultValue": "records",
        "fieldOptions": "records=JSON array\nlines=JSON Lines",
        "position": 1
      },
      {
        "pipelineFieldId": 5,
        "tagKey": "output",
        "label": "Output",
        "fieldType": "text",
        "required": false,
        "position": 2
      },
      {
        "pipelineFieldId": 3,
        "tagKey": "bucket",
        "tagParent": "output",
        "label": "Bucket",
        "fieldType": "text",
        "required": true,
        "helpText": "Where",
        "position": 3
      },
      {
        "pipelineFieldId": 4,
        "tagKey": "summary",
        "label": "Summary",
        "fieldType": "ai",
        "required": false,
        "position": 4,
        "promptId": 1049,
        "promptName": "Sum",
        "variableMap": "{\"text\":\"file:inputKey\"}",
        "onError": "fail",
        "runIn": "worker"
      }
    ]
  }
};

/** What Duplicate handed it (JSON: the cleared pipelineKey and field ids are absent). */
export const DUPLICATE_DATA = {
  "form": {
    "pipelineId": "",
    "pipelineName": "Reference: CSV check and summarise (copy)",
    "description": "service-1 reference pipeline.",
    "tenantId": 2924,
    "sourceTaskTypeId": 11831,
    "topicName": "service-1 reference worker",
    "kafkaTopic": "etl.reference",
    "status": "Active",
    "dateCreated": "2026-09-24T22:06:11.852167",
    "createdBy": 4537,
    "createdByName": "Casey Baseline",
    "fieldCount": 4,
    "requiredCount": 2,
    "fields": [
      {
        "tagKey": "inputKey",
        "label": "Input CSV",
        "fieldType": "text",
        "required": true,
        "position": 0
      },
      {
        "tagKey": "format",
        "label": "Shape",
        "fieldType": "select",
        "required": false,
        "defaultValue": "records",
        "fieldOptions": "records=JSON array\nlines=JSON Lines",
        "position": 1
      },
      {
        "tagKey": "output",
        "label": "Output",
        "fieldType": "text",
        "required": false,
        "position": 2
      },
      {
        "tagKey": "bucket",
        "tagParent": "output",
        "label": "Bucket",
        "fieldType": "text",
        "required": true,
        "helpText": "Where",
        "position": 3
      },
      {
        "tagKey": "summary",
        "label": "Summary",
        "fieldType": "ai",
        "required": false,
        "position": 4,
        "promptId": 1049,
        "promptName": "Sum",
        "variableMap": "{\"text\":\"file:inputKey\"}",
        "onError": "fail",
        "runIn": "worker"
      }
    ]
  }
};

/** What New pipeline handed it. */
export const CREATE_DATA = {};

/** The dialog's Save on EDIT_DATA, untouched. */
export const SAVE_REQUEST = {
  "url": "http://localhost:9098/api/v1/pipeline.json/save",
  "body": {
    "pipelineKey": 100167,
    "pipelineId": "REF_CSV_CHECK_V1",
    "pipelineName": "Reference: CSV check and summarise",
    "sourceTaskTypeId": 11831,
    "description": "service-1 reference pipeline.",
    "status": "Active",
    "fields": [
      {
        "pipelineFieldId": 1,
        "tagKey": "inputKey",
        "tagParent": null,
        "label": "Input CSV",
        "fieldType": "text",
        "required": true,
        "defaultValue": null,
        "helpText": null,
        "fieldOptions": null,
        "position": 0,
        "promptId": null,
        "variableMap": null,
        "onError": null,
        "runIn": null
      },
      {
        "pipelineFieldId": 2,
        "tagKey": "format",
        "tagParent": null,
        "label": "Shape",
        "fieldType": "select",
        "required": false,
        "defaultValue": "records",
        "helpText": null,
        "fieldOptions": "records=JSON array\nlines=JSON Lines",
        "position": 1,
        "promptId": null,
        "variableMap": null,
        "onError": null,
        "runIn": null
      },
      {
        "pipelineFieldId": 5,
        "tagKey": "output",
        "tagParent": null,
        "label": "Output",
        "fieldType": "text",
        "required": false,
        "defaultValue": null,
        "helpText": null,
        "fieldOptions": null,
        "position": 2,
        "promptId": null,
        "variableMap": null,
        "onError": null,
        "runIn": null
      },
      {
        "pipelineFieldId": 3,
        "tagKey": "bucket",
        "tagParent": "output",
        "label": "Bucket",
        "fieldType": "text",
        "required": true,
        "defaultValue": null,
        "helpText": "Where",
        "fieldOptions": null,
        "position": 3,
        "promptId": null,
        "variableMap": null,
        "onError": null,
        "runIn": null
      },
      {
        "pipelineFieldId": 4,
        "tagKey": "summary",
        "tagParent": null,
        "label": "Summary",
        "fieldType": "ai",
        "required": false,
        "defaultValue": null,
        "helpText": null,
        "fieldOptions": null,
        "position": 4,
        "promptId": 1049,
        "variableMap": "{\"text\":\"file:inputKey\"}",
        "onError": "fail",
        "runIn": "worker"
      }
    ]
  }
};
