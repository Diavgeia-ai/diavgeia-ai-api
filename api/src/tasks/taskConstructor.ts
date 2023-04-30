import Task from './task';


export default interface TaskConstructor {
    create(name: string): Task;
}