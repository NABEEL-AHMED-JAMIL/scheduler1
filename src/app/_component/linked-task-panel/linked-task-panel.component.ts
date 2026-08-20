import { Component, Input } from '@angular/core';
import { parseTopicPartition } from '../../global-config';

@Component({
    selector: 'linked-task-panel',
    templateUrl: 'linked-task-panel.component.html'
})
export class LinkedTaskPanelComponent {

    @Input() taskDetail: any;
    @Input() heading: string = 'Linked Task';

    @Input() dividerStyle: boolean = false;

    public copyToClipboard(text: string): void {
        navigator.clipboard.writeText(text);
    }

    public get taskTopic(): string {
        return parseTopicPartition(this.taskDetail?.sourceTaskType?.queueTopicPartition).topic;
    }

    public get taskPartitions(): string {
        return parseTopicPartition(this.taskDetail?.sourceTaskType?.queueTopicPartition).partitions;
    }

}
