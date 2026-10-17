-- ============================================================
-- e语 · 种子词库（Phase 1）
-- 40 个高频动词/核心词 + 15 个实用语块 + 10 个语法骨架
-- frequency_rank 越小 = 频次越高 = 越先发放
-- 幂等：INSERT OR IGNORE，可重复执行
-- ============================================================

-- ---------- 高频词 ----------
INSERT OR IGNORE INTO cards_master (id, type, content, phonetic, definition, examples_json, frequency_rank, tags, difficulty, source) VALUES
('w-001','word','make','/meɪk/','v. 制作；使得；赚（钱）','[{"scene":"日常","en":"Let me make you a coffee.","zh":"我给你冲杯咖啡吧。"},{"scene":"职场","en":"This change will make things easier.","zh":"这个改动会让事情更简单。"}]',1,'["高频动词","使役"]',1,'seed'),
('w-002','word','take','/teɪk/','v. 拿；带走；花费（时间）；乘坐','[{"scene":"日常","en":"It takes 20 minutes to get there.","zh":"到那儿要 20 分钟。"},{"scene":"出行","en":"I''ll take the subway.","zh":"我坐地铁去。"}]',2,'["高频动词","时间"]',1,'seed'),
('w-003','word','get','/ɡet/','v. 得到；变得；到达；理解','[{"scene":"日常","en":"I got your message.","zh":"我收到你的消息了。"},{"scene":"口语","en":"It''s getting late.","zh":"天色晚了。"}]',3,'["高频动词","多义"]',2,'seed'),
('w-004','word','go','/ɡəʊ/','v. 去；进行；变得','[{"scene":"日常","en":"How did the meeting go?","zh":"会议开得怎么样？"}]',4,'["高频动词"]',1,'seed'),
('w-005','word','know','/nəʊ/','v. 知道；认识','[{"scene":"日常","en":"I know what you mean.","zh":"我懂你的意思。"}]',5,'["高频动词","认知"]',1,'seed'),
('w-006','word','think','/θɪŋk/','v. 认为；思考','[{"scene":"口语","en":"I think it''s worth a try.","zh":"我觉得值得一试。"}]',6,'["高频动词","观点"]',1,'seed'),
('w-007','word','want','/wɒnt/','v. 想要；需要','[{"scene":"日常","en":"Do you want to grab lunch?","zh":"要一起吃午饭吗？"}]',7,'["高频动词","意愿"]',1,'seed'),
('w-008','word','need','/niːd/','v. 需要 n. 需求','[{"scene":"职场","en":"We need more time on this.","zh":"这件事我们需要更多时间。"}]',8,'["高频动词","需求"]',1,'seed'),
('w-009','word','use','/juːz/','v. 使用 n. 用途','[{"scene":"日常","en":"Can I use your charger?","zh":"我能用一下你的充电器吗？"}]',9,'["高频动词"]',1,'seed'),
('w-010','word','find','/faɪnd/','v. 找到；发现；觉得','[{"scene":"日常","en":"I find this app really useful.","zh":"我觉得这个应用很好用。"}]',10,'["高频动词"]',2,'seed'),
('w-011','word','give','/ɡɪv/','v. 给；提供；让步','[{"scene":"职场","en":"Give me a minute to check.","zh":"给我一分钟确认一下。"}]',11,'["高频动词"]',1,'seed'),
('w-012','word','tell','/tel/','v. 告诉；分辨','[{"scene":"日常","en":"Tell me how it went.","zh":"跟我说说进展如何。"}]',12,'["高频动词"]',1,'seed'),
('w-013','word','work','/wɜːk/','v. 工作；起作用 n. 工作','[{"scene":"职场","en":"This approach works better.","zh":"这个办法更管用。"}]',13,'["高频动词","职场"]',2,'seed'),
('w-014','word','call','/kɔːl/','v. 打电话；称呼 n. 通话','[{"scene":"职场","en":"I''ll call you back in ten minutes.","zh":"我十分钟后回你电话。"}]',14,'["高频动词","沟通"]',1,'seed'),
('w-015','word','try','/traɪ/','v. 尝试；努力 n. 尝试','[{"scene":"日常","en":"Try again tomorrow.","zh":"明天再试一次。"}]',15,'["高频动词"]',1,'seed'),
('w-016','word','ask','/ɑːsk/','v. 询问；请求；邀请','[{"scene":"职场","en":"Feel free to ask questions.","zh":"有问题随时问。"}]',16,'["高频动词","沟通"]',1,'seed'),
('w-017','word','feel','/fiːl/','v. 感觉；觉得；摸起来','[{"scene":"日常","en":"I feel much better today.","zh":"我今天好多了。"}]',17,'["高频动词","情绪"]',1,'seed'),
('w-018','word','leave','/liːv/','v. 离开；留下；请假','[{"scene":"职场","en":"I''m leaving at six today.","zh":"我今天六点走。"}]',18,'["高频动词"]',2,'seed'),
('w-019','word','put','/pʊt/','v. 放；表达；投入','[{"scene":"日常","en":"Put it on the table, please.","zh":"请放在桌上。"}]',19,'["高频动词"]',1,'seed'),
('w-020','word','mean','/miːn/','v. 意思是；意味着 adj. 刻薄的','[{"scene":"口语","en":"What do you mean by that?","zh":"你这话是什么意思？"}]',20,'["高频动词","多义"]',2,'seed'),
('w-021','word','keep','/kiːp/','v. 保持；继续；保存','[{"scene":"日常","en":"Keep me posted.","zh":"有进展随时告诉我。"}]',21,'["高频动词","持续"]',2,'seed'),
('w-022','word','let','/let/','v. 让；允许','[{"scene":"日常","en":"Let me think about it.","zh":"让我想想。"}]',22,'["高频动词","使役"]',1,'seed'),
('w-023','word','begin','/bɪˈɡɪn/','v. 开始','[{"scene":"职场","en":"Let''s begin with the basics.","zh":"我们从基础开始吧。"}]',23,'["高频动词"]',1,'seed'),
('w-024','word','seem','/siːm/','v. 似乎；好像','[{"scene":"日常","en":"You seem tired today.","zh":"你今天好像很累。"}]',24,'["高频动词","判断"]',2,'seed'),
('w-025','word','help','/help/','v. 帮助 n. 帮助','[{"scene":"日常","en":"Can you help me with this?","zh":"能帮我一下吗？"}]',25,'["高频动词"]',1,'seed'),
('w-026','word','talk','/tɔːk/','v. 谈话 n. 交谈；演讲','[{"scene":"职场","en":"Let''s talk about it tomorrow.","zh":"明天再谈这件事。"}]',26,'["高频动词","沟通"]',1,'seed'),
('w-027','word','turn','/tɜːn/','v. 转动；变成 n. 轮到','[{"scene":"日常","en":"Turn left at the corner.","zh":"在拐角处左转。"}]',27,'["高频动词","方向"]',2,'seed'),
('w-028','word','show','/ʃəʊ/','v. 展示；表明 n. 节目','[{"scene":"职场","en":"Let me show you how it works.","zh":"我给你演示一下怎么用。"}]',28,'["高频动词"]',1,'seed'),
('w-029','word','hear','/hɪə/','v. 听见；听说','[{"scene":"日常","en":"I heard you got promoted.","zh":"听说你升职了。"}]',29,'["高频动词","感官"]',1,'seed'),
('w-030','word','run','/rʌn/','v. 跑；经营；运行','[{"scene":"职场","en":"Who runs this project?","zh":"这个项目谁负责？"}]',30,'["高频动词","多义"]',2,'seed'),
('w-031','word','move','/muːv/','v. 移动；搬家；打动','[{"scene":"日常","en":"We''re moving to a new office.","zh":"我们要搬到新办公室。"}]',31,'["高频动词"]',2,'seed'),
('w-032','word','live','/lɪv/','v. 居住；生活 adj. 现场的','[{"scene":"日常","en":"I live near the subway station.","zh":"我住在地铁站附近。"}]',32,'["高频动词","生活"]',1,'seed'),
('w-033','word','believe','/bɪˈliːv/','v. 相信；认为','[{"scene":"口语","en":"I can''t believe it''s already October.","zh":"真不敢相信都十月了。"}]',33,'["高频动词","认知"]',2,'seed'),
('w-034','word','hold','/həʊld/','v. 握住；举行；容纳','[{"scene":"职场","en":"We''ll hold the meeting online.","zh":"我们线上开会。"}]',34,'["高频动词"]',2,'seed'),
('w-035','word','bring','/brɪŋ/','v. 带来；导致','[{"scene":"日常","en":"Bring your laptop tomorrow.","zh":"明天带上你的笔记本电脑。"}]',35,'["高频动词"]',1,'seed'),
('w-036','word','happen','/ˈhæpən/','v. 发生；碰巧','[{"scene":"日常","en":"What happened to your phone?","zh":"你手机怎么了？"}]',36,'["高频动词"]',2,'seed'),
('w-037','word','write','/raɪt/','v. 写；写信','[{"scene":"职场","en":"Write it down before you forget.","zh":"趁没忘先记下来。"}]',37,'["高频动词"]',1,'seed'),
('w-038','word','stand','/stænd/','v. 站；忍受；立场','[{"scene":"口语","en":"I can''t stand the noise.","zh":"我受不了这噪音。"}]',38,'["高频动词","多义"]',2,'seed'),
('w-039','word','lose','/luːz/','v. 丢失；输；失去','[{"scene":"日常","en":"I lost my keys again.","zh":"我又把钥匙弄丢了。"}]',39,'["高频动词"]',2,'seed'),
('w-040','word','pay','/peɪ/','v. 支付；付出代价 n. 薪水','[{"scene":"日常","en":"Can I pay by card?","zh":"可以刷卡吗？"}]',40,'["高频动词","金钱"]',1,'seed');

-- ---------- 实用语块 Chunks ----------
INSERT OR IGNORE INTO cards_master (id, type, content, phonetic, definition, examples_json, frequency_rank, tags, difficulty, source) VALUES
('c-001','chunk','How''s it going?','/haʊz ɪt ˈɡəʊɪŋ/','最近怎么样？（比 How are you 更随意自然）','[{"scene":"打招呼","en":"Hey Tom, how''s it going?","zh":"嘿 Tom，最近怎么样？"}]',101,'["口语","问候"]',1,'seed'),
('c-002','chunk','It depends on ...','/ɪt dɪˈpendz ɒn/','这取决于……','[{"scene":"职场","en":"It depends on how much time we have.","zh":"这取决于我们有多少时间。"}]',102,'["口语","模糊回答"]',2,'seed'),
('c-003','chunk','make sense','/meɪk sens/','讲得通；有道理','[{"scene":"讨论","en":"That makes sense to me.","zh":"我觉得这说得通。"}]',103,'["口语","逻辑"]',2,'seed'),
('c-004','chunk','on the way','/ɒn ðə weɪ/','在路上；顺路','[{"scene":"日常","en":"I''m on my way now.","zh":"我已经在路上了。"}]',104,'["口语","位置"]',1,'seed'),
('c-005','chunk','run out of','/rʌn aʊt ɒv/','用完；耗尽','[{"scene":"日常","en":"We ran out of milk.","zh":"牛奶喝完了。"}]',105,'["短语动词","资源"]',2,'seed'),
('c-006','chunk','look forward to','/lʊk ˈfɔːwəd tuː/','期待（后接名词或 doing）','[{"scene":"职场","en":"I look forward to working with you.","zh":"期待与你合作。"}]',106,'["书面","期待","doing"]',2,'seed'),
('c-007','chunk','get used to','/ɡet juːst tuː/','习惯于（后接名词或 doing）','[{"scene":"日常","en":"I''m getting used to the new schedule.","zh":"我慢慢习惯新作息了。"}]',107,'["短语动词","doing"]',3,'seed'),
('c-008','chunk','in charge of','/ɪn tʃɑːdʒ ɒv/','负责……','[{"scene":"职场","en":"She''s in charge of the design team.","zh":"她负责设计团队。"}]',108,'["职场","职责"]',2,'seed'),
('c-009','chunk','as far as I know','/əz fɑːr əz aɪ nəʊ/','据我所知','[{"scene":"讨论","en":"As far as I know, the deadline is Friday.","zh":"据我所知，截止日期是周五。"}]',109,'["口语","留余地"]',2,'seed'),
('c-010','chunk','take your time','/teɪk jɔː taɪm/','慢慢来；不着急','[{"scene":"日常","en":"Take your time, there''s no rush.","zh":"慢慢来，不着急。"}]',110,'["口语","礼貌"]',1,'seed'),
('c-011','chunk','catch up','/kætʃ ʌp/','赶上；叙旧','[{"scene":"社交","en":"Let''s catch up over coffee sometime.","zh":"改天喝杯咖啡聊聊近况吧。"}]',111,'["短语动词","社交"]',2,'seed'),
('c-012','chunk','figure out','/ˈfɪɡər aʊt/','弄明白；想出办法','[{"scene":"职场","en":"I''ll figure out a way to fix it.","zh":"我会想办法解决。"}]',112,'["短语动词","问题解决"]',2,'seed'),
('c-013','chunk','end up','/end ʌp/','最终变成；结果是','[{"scene":"日常","en":"We ended up staying home.","zh":"我们最后待在家里了。"}]',113,'["短语动词","结果"]',3,'seed'),
('c-014','chunk','be supposed to','/biː səˈpəʊzd tuː/','本应该；按理说','[{"scene":"职场","en":"You''re supposed to submit it by noon.","zh":"你应该中午前提交。"}]',114,'["句型","义务"]',3,'seed'),
('c-015','chunk','I''m not sure if ...','/aɪm nɒt ʃʊər ɪf/','我不确定是否……','[{"scene":"职场","en":"I''m not sure if we can finish it this week.","zh":"我不确定这周能不能做完。"}]',115,'["口语","不确定"]',2,'seed');

-- ---------- 语法骨架 Grammar ----------
INSERT OR IGNORE INTO cards_master (id, type, content, phonetic, definition, grammar_pattern, explanation, examples_json, frequency_rank, tags, difficulty, source) VALUES
('g-001','grammar','It takes sb. + 时间 + to do sth.','/ɪt teɪks/','做某事花费某人多少时间','It takes + 人 + 时间 + to + 动词原形','把「耗时」放在句首，重点自然落在时间上。中文习惯说「我花了20分钟」，英文更常说「这件事花了我20分钟」——主语是 it，不是人。','[{"scene":"通勤","en":"It takes me 40 minutes to get to work.","zh":"我上班要 40 分钟。"},{"scene":"学习","en":"It took me a week to finish the book.","zh":"我花了一周读完这本书。"},{"scene":"职场","en":"It won''t take long to set up.","zh":"配置起来不会花太久。"}]',201,'["句型","时间"]',2,'seed'),
('g-002','grammar','I''d rather ... than ...','/aɪd ˈrɑːðə/','我宁愿……也不愿……','would rather + do A + than + do B','表达偏好时比 prefer 更口语、更有态度。注意 than 后面同样跟动词原形，不要加 to。','[{"scene":"选择","en":"I''d rather walk than wait for the bus.","zh":"我宁愿走路也不等公交。"},{"scene":"职场","en":"I''d rather do it now than rush later.","zh":"我宁愿现在做完，也不想后面赶。"},{"scene":"社交","en":"I''d rather stay in tonight.","zh":"我今晚宁愿待在家。"}]',202,'["句型","偏好"]',3,'seed'),
('g-003','grammar','There is no point in doing sth.','/ðeər ɪz nəʊ pɔɪnt/','做某事没有意义','There is no point in + doing','用来劝退一个无效动作。in 后面必须用 doing，不能接 to do；想更礼貌可以在前面加 I don''t think。','[{"scene":"讨论","en":"There''s no point in arguing about it now.","zh":"现在争论这个没意义。"},{"scene":"职场","en":"There''s no point in fixing it twice.","zh":"重复修一遍没有意义。"},{"scene":"日常","en":"There''s no point in worrying.","zh":"担心也没用。"}]',203,'["句型","doing"]',3,'seed'),
('g-004','grammar','The more ..., the more ...','/ðə mɔː/','越……就越……','The + 比较级 + 主谓, the + 比较级 + 主谓','两个分句都用「the + 比较级」开头，形成联动。口语里常省略动词，只留 the more the better。','[{"scene":"学习","en":"The more you practice, the more confident you get.","zh":"练得越多，你就越自信。"},{"scene":"职场","en":"The earlier we start, the better.","zh":"越早开始越好。"},{"scene":"消费","en":"The more you buy, the more you save.","zh":"买得越多省得越多。"}]',204,'["句型","比较"]',3,'seed'),
('g-005','grammar','not ... until ...','/nɒt ... ənˈtɪl/','直到……才……','主语 + not + 动词 + until + 时间/从句','中文的「直到…才」在英文里是否定前置：主句用否定，until 引出时间点。写成 didn''t ... until 是最常见的过去时形式。','[{"scene":"日常","en":"I didn''t get home until midnight.","zh":"我直到半夜才到家。"},{"scene":"职场","en":"Don''t reply until you''ve checked the data.","zh":"核对完数据再回复。"},{"scene":"学习","en":"It didn''t click until I used it.","zh":"直到我用起来才真正理解。"}]',205,'["句型","时间"]',3,'seed'),
('g-006','grammar','It is + adj. + for sb. + to do sth.','/ɪt ɪz ... fɔː/','对某人来说做某事是……的','It is + 形容词 + for + 人 + to + 动词原形','评价一件事时，用 it 占主语位，真正的主语（to do）后置。若形容词描述人的品质（kind / nice / stupid），介词要换成 of。','[{"scene":"日常","en":"It''s hard for me to wake up early.","zh":"对我来说早起很难。"},{"scene":"职场","en":"It''s important for us to align first.","zh":"我们先对齐很重要。"},{"scene":"社交","en":"It''s nice of you to say that.","zh":"你这么说真好。"}]',206,'["句型","评价"]',2,'seed'),
('g-007','grammar','have / get sth. done','/hæv ... dʌn/','让别人做某事；遭遇某事','have/get + 宾语 + 过去分词','主语不亲自做，而是「让/请别人做」，或表示「碰上某事」。判断依据是语境：有安排感就是「请人做」，被动承受就是「遭遇」。','[{"scene":"生活","en":"I got my hair cut yesterday.","zh":"我昨天剪了头发。"},{"scene":"职场","en":"We need to get this fixed by Friday.","zh":"我们得在周五前把这事解决掉。"},{"scene":"倒霉","en":"He had his wallet stolen.","zh":"他钱包被偷了。"}]',207,'["句型","使役","被动"]',4,'seed'),
('g-008','grammar','would have done','/wʊd həv dʌn/','本来会……（对过去的虚拟）','would have + 过去分词','谈论「过去没发生、但如果发生了就会怎样」。常与 if 从句（had done）搭配，是表达遗憾和复盘的核心结构。','[{"scene":"复盘","en":"I would have called if I''d known.","zh":"我要是知道就打电话了。"},{"scene":"职场","en":"We would have missed the deadline without you.","zh":"没有你我们就赶不上了。"},{"scene":"日常","en":"It would have been cheaper to book early.","zh":"早点订本来会更便宜。"}]',208,'["句型","虚拟语气"]',4,'seed'),
('g-009','grammar','be about to do sth. when ...','/biː əˈbaʊt tuː/','正要做某事，这时……','be about to + 动词原形 + when + 一般过去时','制造「即将发生—突然打断」的叙事张力。when 在这里等于「就在这时」，不能换成 while。','[{"scene":"日常","en":"I was about to leave when it started raining.","zh":"我正要走，这时下起雨来。"},{"scene":"职场","en":"We were about to ship when QA found a bug.","zh":"我们正要发布，测试发现了一个 bug。"},{"scene":"社交","en":"She was about to say something when the phone rang.","zh":"她刚要开口，电话响了。"}]',209,'["句型","叙事"]',4,'seed'),
('g-010','grammar','so + adj./adv. + that ...','/səʊ ... ðæt/','如此……以至于……','so + 形容词/副词 + that + 结果从句','强调程度导致结果。名词前要用 such，不要用 so；这是中国学习者最高频的错点之一。','[{"scene":"日常","en":"I was so tired that I fell asleep on the couch.","zh":"我累得在沙发上睡着了。"},{"scene":"职场","en":"The meeting ran so long that we skipped lunch.","zh":"会开得太久，我们午饭都没吃。"},{"scene":"学习","en":"It''s so simple that anyone can do it.","zh":"简单到谁都能做。"}]',210,'["句型","结果"]',3,'seed');
