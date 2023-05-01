const express = require("express");
const path = require("path");
const pool = require("../config");
const fs = require("fs");
const Joi = require('joi')

router = express.Router();

// Require multer for file upload
const multer = require("multer");
const { start } = require("repl");
// SET STORAGE
var storage = multer.diskStorage({
  destination: function (req, file, callback) {
    // console.log(req.files.myImage)
    callback(null, "./static/uploads");
  },
  filename: function (req, file, callback) {
    callback(
      null,
      file.fieldname + "-" + Date.now() + path.extname(file.originalname)
    );
  },
});

const upload = multer({ storage: storage,
                        limits: { fileSize: 1 * 1024 * 1024 }});

console.log(upload)


// const titleValidator = (value, helpers) =>{

//   if(value.match(/[0-9]/) ){
//       throw new Joi.ValidationError('title must be have number')
//   }
//   return value
// }




const blogSchema = Joi.object({
    title : Joi.string().trim().min(10).max(25).required().pattern(/^[a-zA-Z\s]+$/),
    content: Joi.string().min(50).required(),
    status : Joi.string().valid( 'status_private', 'status_public').required(),
    reference : Joi.string().uri().allow(''),
    // start_date : Joi.date().when('end_date', {is : Joi.date(), then : Joi.date().less(Joi.ref('end_date'))}),
    // end_date: Joi.date().when('start_date', {is : Joi.date(), then : Joi.date().greater(Joi.ref('start_date'))}),
    start_date: Joi.date().allow(''),
end_date: Joi.date().min(Joi.ref('start_date')).when('start_date', {
is: Joi.date().required(),
then: Joi.date().required(),
otherwise: Joi.date().allow(null, ''),
}),
    pinned : Joi.number(),

})
// Like blog that id = blogId
router.put("/blogs/addlike/:blogId", async function (req, res, next) {
  const conn = await pool.getConnection();
  // Begin transaction
  await conn.beginTransaction();

  try {
    let [
      rows,
      fields,
    ] = await conn.query("SELECT `like` FROM `blogs` WHERE `id` = ?", [
      req.params.blogId,
    ]);
    let like = rows[0].like + 1;

    await conn.query("UPDATE `blogs` SET `like` = ? WHERE `id` = ?", [
      like,
      req.params.blogId,
    ]);

    await conn.commit();
    res.json({ like: like });
  } catch (err) {
    await conn.rollback();
    return res.status(500).json(err);
  } finally {
    console.log("finally");
    conn.release();
  }
});

router.post(
  "/blogs",
  upload.array("myImage", 5),
  async function (req, res, next) {
    console.log(req.body)
    // upload(req, res, (err) =>{
    //   if(err instanceof multer.MulterError){
    //     res.send(err)
    //   }
    //   else if(err){
    //     res.send(er
    //   }
    // })
  try{
      await blogSchema.validateAsync(req.body,  { abortEarly: false })
  }catch(err){
      return res.status(400).json(err)
  }
    if (req.method == "POST") {
      const file = req.files;
      let pathArray = [];
      console.log(file)

      if (!file) {
        return res.status(400).json({ message: "Please upload a file" });
      }
    
        
        const title = req.body.title;
        const content = req.body.content;
        let status = req.body.status;
        const pinned = req.body.pinned;
        console.log(status)
        console.log(pinned)
        if(status  == 'status_private'){
          status = '01'
        }
        else{
          status = '02'
        }
  
        const conn = await pool.getConnection();
        // Begin transaction
        await conn.beginTransaction();
  
        try {
          let results = await conn.query(
            "INSERT INTO blogs(title, content, status, pinned, `like`,create_date) VALUES(?, ?, ?, ?, 0,CURRENT_TIMESTAMP);",
            [title, content, status, pinned]
          );
          const blogId = results[0].insertId;
         console.log(req.files[0].size)
        
           req.files.forEach((file, index) => {
             let path = [blogId, file.path.substring(6), index == 0 ? 1 : 0];
             pathArray.push(path);
           });
   
         console.log(pathArray)
  
          await conn.query(
            "INSERT INTO images(blog_id, file_path, main) VALUES ?;",
            [pathArray]
          );
          // console.log(pathArray)
  
          await conn.commit();
          res.send("success!");
        } catch (err) {
          await conn.rollback();
          return res.status(400).json(err);
        } finally {
          console.log("finally");
          conn.release();
        }
      }

      
    }

 
);

// Blog detail
router.get("/blogs/:id", function (req, res, next) {
  // Query data from 3 tables
  const promise1 = pool.query("SELECT * FROM blogs WHERE id=?", [
    req.params.id,
  ]);
  const promise2 = pool.query("SELECT * FROM comments WHERE blog_id=?", [
    req.params.id,
  ]);
  const promise3 = pool.query("SELECT * FROM images WHERE blog_id=?", [
    req.params.id,
  ]);

  // Use Promise.all() to make sure that all queries are successful
  Promise.all([promise1, promise2, promise3])
    .then((results) => {
      const [blogs, blogFields] = results[0];
      const [comments, commentFields] = results[1];
      const [images, imageFields] = results[2];
      res.json({
        blog: blogs[0],
        images: images,
        comments: comments,
        error: null,
      });
    })
    .catch((err) => {
      return res.status(500).json(err);
    });
});

router.put("/blogs/:id", upload.array("myImage", 5), async function (req, res, next) {
  // Your code here
  const file = req.files;
  let pathArray = []

  if (!file) {
    const error = new Error("Please upload a file");
    error.httpStatusCode = 400;
    next(error);
  }

  const title = req.body.title;
  const content = req.body.content;
  const status = req.body.status;
  const pinned = req.body.pinned;

  const conn = await pool.getConnection()
  await conn.beginTransaction();

  try {
    console.log(content)
    let results = await conn.query(
      "UPDATE blogs SET title=?, content=?, status=?, pinned=? WHERE id=?",
      [title, content, status, pinned, req.params.id]
    )

    if (file.length > 0) {
      file.forEach((file, index) => {
        let path = [req.params.id, file.path.substring(6), 0]
        pathArray.push(path)
      })

      await conn.query(
        "INSERT INTO images(blog_id, file_path, main) VALUES ?;",
        [pathArray])
    }

    await conn.commit()
    res.send("success!");
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    console.log('finally')
    conn.release();
  }
  return;
});

router.delete("/blogs/:blogId", async function (req, res, next) {
  // Your code here
  const conn = await pool.getConnection();
  // Begin transaction
  await conn.beginTransaction();

  try {
    // Check that there is no comments
    const [
      rows1,
      fields1,
    ] = await conn.query(
      "SELECT COUNT(*) FROM `comments` WHERE `blog_id` = ?",
      [req.params.blogId]
    );
    console.log(rows1);

    if (rows1[0]["COUNT(*)"] > 0) {
      return res
        .status(400)
        .json({ message: "Cannot delete blogs with comments" });
    }

    //Delete files from the upload folder
    const [
      images,
      imageFields,
    ] = await conn.query(
      "SELECT `file_path` FROM `images` WHERE `blog_id` = ?",
      [req.params.blogId]
    );
    const appDir = path.dirname(require.main.filename); // Get app root directory
    console.log(appDir)
    images.forEach((e) => {
      const p = path.join(appDir, 'static', e.file_path);
      fs.unlinkSync(p);
    });

    // Delete images
    await conn.query("DELETE FROM `images` WHERE `blog_id` = ?", [
      req.params.blogId,
    ]);
    // Delete the selected blog
    const [
      rows2,
      fields2,
    ] = await conn.query("DELETE FROM `blogs` WHERE `id` = ?", [
      req.params.blogId,
    ]);

    if (rows2.affectedRows === 1) {
      await conn.commit();
      res.status(204).send();
    } else {
      throw "Cannot delete the selected blog";
    }
  } catch (err) {
    console.log(err)
    await conn.rollback();
    return res.status(500).json(err);
  } finally {
    conn.release();
  }
});

exports.router = router;
