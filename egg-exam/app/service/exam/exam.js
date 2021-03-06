/*
 * @Author: jasonandjay 
 * @Date: 2019-03-04 12:00:54 
 * @Last Modified by: jasonandjay
 * @Last Modified time: 2019-03-12 22:38:15
 */
const Service = require('egg').Service;
const path = require('path');
const fs = require('fs');
const {
    getFilterQuestions,
    getRandomQuestions,
    getQuestions
} = require('../../sql/exam');
class ExamService extends Service{
    // 获取当前课程之前的所有课程试题
    async beforeSubjectsQuestions(subject_id, exam_id = ''){
        // 获取所有学科
        let subjects = await this.app.mysql.select('subject');
        let subject_index = subjects.findIndex(item=>item.subject_id===subject_id);
        // 获取本学科之前所有的学科
        let subject_ids = subjects.filter((item, index)=>index<=subject_index).map(item=>item.subject_id)
        // 读取所有的试题
        let result = await this.app.mysql.query(getFilterQuestions(subject_ids));
        if (exam_id){
            // 获取本次考试之前所有的考试
            let types = await this.app.mysql.select('exam_type');
            let exam_index = types.findIndex(item=>item.exam_id===exam_id);
            let exam_ids = subjects.filter((item, index)=>index<=exam_index).map(item=>item.exam_index)
            // 过滤掉本次考试之后的试题：如当前考试为组件化周考二，那把周考三及月考的题过滤掉
            result = result.filter(item=>{
                if (item.subject_id === subject_id && exam_ids.indexOf(item.exam_id) === -1){
                    return false;
                }
                return true;
            })
        }
        return {questions: result, subject_ids};
    }

    // 获取当前课程的试题，随机获取五份
    async getSubjectQuestions(subject_id, number){
        let questions = await this.app.mysql.query(getRandomQuestions(subject_id, number));
        return questions;
    }

    // 创建新试卷
    async insertExam({exam_id, questions, ...params}){
        let exam_exam_id = this.ctx.helper.randomString(2);
        // 拼接插入数据库中试卷内容
        let exam_content = {
            exam_exam_id,
            exam_type: exam_id,
            user_id: this.ctx.token.user_id,
            ...params,
            question_ids: questions.map(item=>item.questions_id).join(',')
        }
        // 新建试卷
        let result = await this.app.mysql.insert('exam_exam', exam_content);
        // 拼接返回前端试卷内容
        exam_content.questions = questions.map(item=>{
            let jsonContent = fs.readFileSync(path.join(this.app.config.questionsRootPath,item.json_path));
            jsonContent = JSON.parse(jsonContent);
            let {questions_stem,questions_answer} = jsonContent;
            return {
                ...item,
                questions_stem,
                questions_answer
            }
        })
        delete exam_content.question_ids;
        return {row:result.affectedRows,exam_content};
    }
      
    // 更新试卷
    async updateExam({exam_exam_id, question_ids}){
        let row = await this.app.mysql.select('exam_exam', {exam_exam_id});
        // 更新试卷的试题和确认状态
        row = row[0];
        row.question_ids = question_ids;
        row.status = 0;
        let result = await this.app.mysql.update('exam_exam', row, {
            where: {exam_exam_id}
        })
        return result.affectedRows;
    }

    // 所有的考试试卷
    async allExam(querys){
        let {page, pageSize, ...where} = querys;
        page = page*1 || 1;
        pageSize = pageSize*1 || 10;
        let result = await this.app.mysql.select('exam_exam', {
            where: {status: 0, ...where},
            offset: (page-1)*pageSize,
            limit: pageSize
        });
        return result;
    }
    // 删除指定试卷
    async deleteExam(exam_exam_id){
        let result = await this.app.mysql.update('exam_exam', {status: -1}, {
            where: {exam_exam_id}
        });
        return result.affectedRows === 1;
    }

    // 根据id获取试卷
    async getExam(exam_exam_id){
        let result = await this.app.mysql.select('exam_exam', {exam_exam_id});
        // 查询失败
        if (!result || !result.length){
            return false;
        }
        result = result[0];
        // 获取该id对应的试题
        result.questions = await this.app.mysql.query(getQuestions(result.question_ids));
        // 拼接返回前端试卷内容
        result.questions = result.questions.map(item=>{
            let jsonContent = fs.readFileSync(path.join(this.app.config.questionsRootPath,item.json_path));
            jsonContent = JSON.parse(jsonContent);
            let {questions_stem,questions_answer} = jsonContent;
            return {
                ...item,
                questions_stem,
                questions_answer
            }
        })
        return result;
    }
}
module.exports = ExamService;