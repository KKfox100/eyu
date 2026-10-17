-- ============================================================
-- 语块扩展：20 个高频口语 / 书面搭配
-- ============================================================
INSERT OR IGNORE INTO cards_master (id, type, content, phonetic, definition, examples_json, frequency_rank, tags, difficulty, source) VALUES
('c-016','chunk','What do you mean?','/wɒt duː juː miːn/','你是什么意思？（没听懂或质疑时用）','[{"scene":"沟通","en":"What do you mean by ''soon''?","zh":"你说的「很快」是什么意思？"}]',301,'["口语","澄清"]',1,'seed'),
('c-017','chunk','That''s why ...','/ðæts waɪ/','这就是……的原因','[{"scene":"解释","en":"That''s why I asked.","zh":"这就是我问的原因。"}]',302,'["口语","因果"]',1,'seed'),
('c-018','chunk','as long as','/əz lɒŋ əz/','只要（条件）','[{"scene":"讨论","en":"As long as it works, I''m fine.","zh":"只要能用就行。"}]',303,'["连词","条件"]',2,'seed'),
('c-019','chunk','in case','/ɪn keɪs/','以防万一；如果','[{"scene":"日常","en":"Take an umbrella in case it rains.","zh":"带把伞以防下雨。"}]',304,'["连词","预防"]',3,'seed'),
('c-020','chunk','instead of','/ɪnˈsted əv/','而不是；代替','[{"scene":"讨论","en":"Let''s meet online instead of driving there.","zh":"我们线上聊，别跑一趟了。"}]',305,'["介词短语","对比"]',2,'seed'),
('c-021','chunk','at least','/ət liːst/','至少','[{"scene":"日常","en":"At least we tried.","zh":"至少我们试过了。"}]',306,'["口语","程度"]',1,'seed'),
('c-022','chunk','by the way','/baɪ ðə weɪ/','顺便说一下','[{"scene":"社交","en":"By the way, did you get my email?","zh":"顺便问下，你收到我邮件了吗？"}]',307,'["口语","话题切换"]',1,'seed'),
('c-023','chunk','so far','/səʊ fɑː/','到目前为止','[{"scene":"职场","en":"So far, no complaints.","zh":"到目前为止没有投诉。"}]',308,'["口语","时间"]',2,'seed'),
('c-024','chunk','right away','/raɪt əˈweɪ/','立刻；马上','[{"scene":"职场","en":"I''ll do it right away.","zh":"我马上做。"}]',309,'["口语","时间"]',1,'seed'),
('c-025','chunk','in advance','/ɪn ədˈvɑːns/','提前','[{"scene":"职场","en":"Please book it in advance.","zh":"请提前预订。"}]',310,'["书面","时间"]',2,'seed'),
('c-026','chunk','on purpose','/ɒn ˈpɜːpəs/','故意地','[{"scene":"社交","en":"I didn''t do it on purpose.","zh":"我不是故意的。"}]',311,'["口语","意图"]',2,'seed'),
('c-027','chunk','at the moment','/ət ðə ˈməʊmənt/','目前；此刻','[{"scene":"职场","en":"I''m busy at the moment.","zh":"我这会儿正忙。"}]',312,'["口语","时间"]',1,'seed'),
('c-028','chunk','for a while','/fər ə waɪl/','一段时间','[{"scene":"日常","en":"I''ve been waiting for a while.","zh":"我等了一会儿了。"}]',313,'["口语","时间"]',1,'seed'),
('c-029','chunk','in the long run','/ɪn ðə lɒŋ rʌn/','从长远看','[{"scene":"讨论","en":"It pays off in the long run.","zh":"长远来看是值得的。"}]',314,'["书面","判断"]',3,'seed'),
('c-030','chunk','come up with','/kʌm ʌp wɪð/','想出（主意、办法）','[{"scene":"职场","en":"Can you come up with a better name?","zh":"你能想个更好的名字吗？"}]',315,'["短语动词","创造"]',2,'seed'),
('c-031','chunk','put off','/pʊt ɒf/','推迟；使反感','[{"scene":"职场","en":"Let''s put off the meeting till Friday.","zh":"会议推迟到周五吧。"}]',316,'["短语动词","时间"]',2,'seed'),
('c-032','chunk','turn out','/tɜːn aʊt/','结果是；证明是','[{"scene":"日常","en":"It turned out to be a false alarm.","zh":"结果是一场虚惊。"}]',317,'["短语动词","结果"]',3,'seed'),
('c-033','chunk','work out','/wɜːk aʊt/','顺利解决；锻炼','[{"scene":"日常","en":"Everything worked out in the end.","zh":"最后都顺利解决了。"}]',318,'["短语动词","多义"]',3,'seed'),
('c-034','chunk','take care of','/teɪk keə əv/','照顾；处理','[{"scene":"职场","en":"I''ll take care of the details.","zh":"细节我来处理。"}]',319,'["短语动词","责任"]',1,'seed'),
('c-035','chunk','be worth doing','/biː wɜːθ ˈduːɪŋ/','值得做','[{"scene":"讨论","en":"It''s worth trying.","zh":"值得一试。"}]',320,'["句型","doing"]',3,'seed');
